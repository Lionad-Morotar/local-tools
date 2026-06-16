#!/usr/bin/env bash
# clean-cc-history.sh — 清理 ~/.zsh_history 中的 Claude Code 噪声,并补全 ~/.zshrc 防未来配置
#
# 背景
#   cc 经交互式 zsh 注入 spawn 命令(含 CLAUDECODE=1)、含换行的多行命令,
#   且会话内反复执行 pnpm dev / git reset --soft 等。
#   实测曾把 ~/.zsh_history 撑到 111 万行,其中 99% 为噪声:
#     - 66 万行多行续行碎片(heredoc body / \ 续行 / 损坏乱码)
#     - 1.8 万行 cc agent teams spawn 命令
#     - 45 万行重复命令(pnpm dev ×17059, git reset --soft ×5002 ...)
#
# 本脚本做两件事
#   1. 清理存量: 删续行碎片 + cc spawn + 含非法字节的损坏行 + 重复命令去重(每条留最新一条)
#   2. 补全配置: 幂等写入 ~/.zshrc 三道防线
#
# 用法
#   bash clean-cc-history.sh             # 清理 + 补全配置(默认)
#   bash clean-cc-history.sh --clean     # 仅清理
#   bash clean-cc-history.sh --patch     # 仅补全配置
#   bash clean-cc-history.sh --dry-run   # 预览清理效果,不写文件
#
# 回滚
#   cp ~/.zsh_history.bak.<timestamp> ~/.zsh_history

set -euo pipefail

HISTFILE_PATH="${HISTFILE:-$HOME/.zsh_history}"
ZSHRC="$HOME/.zshrc"
ACTION="all"
DRY_RUN=0

for arg in "$@"; do
  case "$arg" in
    --clean) ACTION="clean" ;;
    --patch) ACTION="patch" ;;
    --dry-run) DRY_RUN=1; ACTION="clean" ;;
    -h|--help)
      sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg (用 --help 查看用法)"; exit 1 ;;
  esac
done

# macOS BSD tail 支持 -r 反转行序; Linux GNU tail 不支持, 改用 tac
if tail -r </dev/null >/dev/null 2>&1; then
  REVERSE=(tail -r)
else
  REVERSE=(tac)
fi

# 防未来配置块(幂等写入 ~/.zshrc, 在 export SAVEHIST= 之后插入)
CONFIG_BLOCK="# History: 过滤 Claude Code 噪声
# Why: cc 经交互式 zsh 注入 spawn 命令(含 CLAUDECODE=1)与含换行的多行命令,
#      会话内反复执行 pnpm dev/git reset 等,曾占满 111 万行 history 的 99%。
#      三道防线: spawn 整条不记 / 同命令去重留新 / 翻历史跳重复
HISTORY_IGNORE='*CLAUDECODE=1*'
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS"

clean_history() {
  [[ -f "$HISTFILE_PATH" ]] || { echo "❌ 未找到 $HISTFILE_PATH"; exit 1; }
  local before after bak tmp
  before=$(wc -l < "$HISTFILE_PATH" | tr -d ' ')
  tmp="/tmp/zsh_history.clean.$$"
  echo "清理前: $before 行"

  # 管道:
  #   iconv -c        修整非法 UTF-8 字节(防后续工具报错)
  #   rg '^: '        只留标准行 → 删 66 万续行碎片
  #   rg -v ...       删 cc spawn 命令
  #   reverse         反转(最新在前)
  #   awk             以 ; 后的命令为 key 去重, 留首次(=最新), 顺带删空命令残行
  #   reverse         转回时间正序
  iconv -c -f UTF-8 -t UTF-8 "$HISTFILE_PATH" 2>/dev/null \
    | rg '^: ' \
    | rg -v 'CLAUDECODE=1|--agent-id ' \
    | "${REVERSE[@]}" \
    | awk '{cmd=substr($0,index($0,";")+1); if(length(cmd)>1 && !seen[cmd]++) print}' \
    | "${REVERSE[@]}" \
    > "$tmp"

  after=$(wc -l < "$tmp" | tr -d ' ')

  # 安全校验: 防止管道异常导致清空
  if [[ "$after" -lt 100 ]]; then
    echo "⚠️  清理后仅 $after 行(预期数百~数千),管道疑似异常,已中止"
    rm -f "$tmp"; exit 1
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] 清理后: $after 行 (削减 $((before-after)), $(( (before-after)*100/before ))%)"
    echo "[dry-run] 未写入文件"; rm -f "$tmp"; return
  fi

  bak="$HISTFILE_PATH.bak.$(date +%Y%m%d%H%M%S)"
  cp "$HISTFILE_PATH" "$bak"
  mv "$tmp" "$HISTFILE_PATH"
  echo "✅ 清理后: $after 行 (削减 $((before-after)), $(( (before-after)*100/before ))%)"
  echo "备份: $bak"
}

patch_zshrc() {
  [[ -f "$ZSHRC" ]] || { echo "❌ 未找到 $ZSHRC"; exit 1; }

  if grep -q 'HISTORY_IGNORE=' "$ZSHRC"; then
    echo "ℹ️  ~/.zshrc 已有 HISTORY_IGNORE 配置,跳过补丁"
    return
  fi

  if ! grep -q '^export SAVEHIST=' "$ZSHRC"; then
    echo "⚠️  ~/.zshrc 未找到 'export SAVEHIST=' 锚点,请手动在 history 配置区添加:"
    printf '%s\n' "$CONFIG_BLOCK"
    return 1
  fi

  local tmp="/tmp/zshrc.tmp.$$"
  awk -v b="$CONFIG_BLOCK" '/^export SAVEHIST=/ && !d {print; print ""; print b; d=1; next} {print}' \
    "$ZSHRC" > "$tmp" && mv "$tmp" "$ZSHRC"
  echo "✅ 已补全 ~/.zshrc 防未来配置(新开终端或 source ~/.zshrc 生效)"
}

case "$ACTION" in
  clean) clean_history ;;
  patch) patch_zshrc ;;
  all) clean_history; echo; patch_zshrc ;;
esac
