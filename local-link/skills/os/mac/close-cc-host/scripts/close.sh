#!/usr/bin/env bash
# 触发本窗口 close-host-window 扩展关闭宿主（扩展内部先 SIGTERM claude 走 SessionEnd，再关 host）。
# --host vscode   关整个窗口（连带所有终端面板）
# --host terminal 默认，只关活动终端面板，保留窗口
set -euo pipefail

host="terminal"
while [ $# -gt 0 ]; do
  case "$1" in
    --host) host="${2:-}"; shift 2 ;;
    --host=*) host="${1#--host=}"; shift ;;
    *) shift ;;
  esac
done

# 向上找 workspace 根（.vscode/.git 标记），哨兵须落在扩展 watch 的 workspace 根下
find_workspace_root() {
  local dir="$PWD"
  while [ "$dir" != "/" ] && [ ! -d "$dir/.vscode" ] && [ ! -d "$dir/.git" ]; do
    dir="$(dirname "$dir")"
  done
  if [ "$dir" = "/" ] && [ ! -d "/.vscode" ] && [ ! -d "/.git" ]; then
    echo "ERR: cwd 不在 VSCode workspace 下（找不到 .vscode/.git），哨兵通道不可用" >&2
    return 1
  fi
  printf '%s' "$dir"
}

# 在 workspace 根的 .vscode/ 下落哨兵文件
touch_sentinel() {
  local root
  root="$(find_workspace_root)" || exit 1
  [ -d "$root/.vscode" ] || mkdir -p "$root/.vscode"
  touch "$root/.vscode/$1"
}

case "$host" in
  vscode)
    # socket 通道（新终端，扩展注入 $VSC_WINDOW_CLOSE_HOOK）精度最高；老终端无变量走哨兵
    if [ -n "${VSC_WINDOW_CLOSE_HOOK:-}" ] && [ -S "$VSC_WINDOW_CLOSE_HOOK" ]; then
      nc -U "$VSC_WINDOW_CLOSE_HOOK" </dev/null
    else
      touch_sentinel ".close-window-signal"
    fi
    ;;
  terminal)
    # terminal 只走哨兵（socket 通道固定 vscode；dispose 活动终端不需 per-window socket 精度）
    touch_sentinel ".close-terminal-signal"
    ;;
  *)
    echo "ERR: --host 只支持 vscode|terminal，得到：$host" >&2
    exit 1
    ;;
esac
