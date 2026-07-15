---
name: create-project-hapi
description: 为指定项目创建完全隔离的 hapi（Claude Code On the Go）实例，包括独立数据目录、LaunchAgent 持久化、zsh wrapper 和 app.hapi.run 直连 URL。与全局 ~/.hapi 互不干扰。
disable-model-invocation: false
argument-hints: "<project-dir> [hub-port=3007]"
---

# create-project-hapi

为项目单独开一个 hapi 实例，与全局 `~/.hapi` 完全隔离。适合：

- 一台机器上维护多个项目的独立 hapi 配置、token、relay
- 项目级 hapi 随用户登录自动启动，不依赖当前终端
- 团队复用同一套项目级 hapi 配置

## 前置条件

- macOS
- hapi 已通过 Homebrew 安装：`/opt/homebrew/bin/hapi`
- 使用 zsh
- 已知目标项目根目录绝对路径

## 参数

- `<project-dir>`：项目根目录绝对路径
- `[hub-port]`：可选，默认 `3007`，避免与全局 hapi hub `3006` 冲突

## 执行步骤

### 1. 设置变量

```bash
PROJECT_DIR="/path/to/project"   # 替换为实际路径
PROJECT_NAME=$(basename "$PROJECT_DIR")
HAPI_PORT="${2:-3007}"
HAPI_HOME="$PROJECT_DIR/.hapi"
PLIST_DIR="$HOME/Library/LaunchAgents"
```

### 2. 创建独立 HAPI_HOME 并生成 token

```bash
mkdir -p "$HAPI_HOME"
HAPI_HOME="$HAPI_HOME" HAPI_LISTEN_PORT="$HAPI_PORT" hapi hub --relay
```

首次启动会生成新的 `cliApiToken` 并保存到 `$HAPI_HOME/settings.json`。终端会打印 relay URL，例如：

```
https://xxxxxx.relay.hapi.run
```

记下 token 和 relay URL。token 可通过以下命令再次读取：

```bash
python3 -c "import json; print(json.load(open('$HAPI_HOME/settings.json'))['cliApiToken'])"
```

### 3. 创建 LaunchAgent plist

#### Hub（带 relay）

文件：`$PLIST_DIR/com.hapi.$PROJECT_NAME.hub.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.hapi.PROJECT_NAME.hub</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/hapi</string>
        <string>hub</string>
        <string>--relay</string>
    </array>
    <key>WorkingDirectory</key>
    <string>PROJECT_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HAPI_HOME</key>
        <string>HAPI_HOME</string>
        <key>HAPI_LISTEN_PORT</key>
        <string>HAPI_PORT</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>HOME/Library/Logs/hapi/PROJECT_NAME-hub.log</string>
    <key>StandardErrorPath</key>
    <string>HOME/Library/Logs/hapi/PROJECT_NAME-hub-error.log</string>
</dict>
</plist>
```

#### Runner

文件：`$PLIST_DIR/com.hapi.$PROJECT_NAME.runner.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.hapi.PROJECT_NAME.runner</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/hapi</string>
        <string>runner</string>
        <string>start</string>
    </array>
    <key>WorkingDirectory</key>
    <string>PROJECT_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HAPI_HOME</key>
        <string>HAPI_HOME</string>
        <key>HAPI_API_URL</key>
        <string>http://localhost:HAPI_PORT</string>
        <!-- 远程会话也使用自定义 Claude wrapper；默认模式从 HAPI_HOME/claude-mode 读取 -->
        <key>HAPI_CLAUDE_PATH</key>
        <string>HOME/.hapi/claude-wrappers/hapi-claude</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>StandardOutPath</key>
    <string>HOME/Library/Logs/hapi/PROJECT_NAME-runner.log</string>
    <key>StandardErrorPath</key>
    <string>HOME/Library/Logs/hapi/PROJECT_NAME-runner-error.log</string>
</dict>
</plist>
```

替换占位符：`PROJECT_NAME`、`PROJECT_DIR`、`HAPI_HOME`、`HAPI_PORT`、`HOME`。

### 4. 加载 LaunchAgent

```bash
mkdir -p "$HOME/Library/Logs/hapi"
launchctl load -w "$PLIST_DIR/com.hapi.$PROJECT_NAME.hub.plist"
launchctl load -w "$PLIST_DIR/com.hapi.$PROJECT_NAME.runner.plist"
```

### 5. 创建 Claude 模式 wrapper 脚本

hapi 默认调用系统 `claude` 命令。若希望 hapi 使用 `ckh`/`cg` 等自定义 Claude 启动方式（对应 `~/.cp/*.json` 的 settings），需要创建一个 wrapper 脚本，并通过 `HAPI_CLAUDE_PATH` 环境变量让 hapi 使用它。

当 hapi 启动 direct-connect / runner 会话时，会透传一个自己的 `--settings`（session-hook，用于注入 hapi 的 SessionStart hook）。这个 session-hook 如果直接覆盖 mode settings，会导致 `ANTHROPIC_BASE_URL` 等 provider env 丢失。因此 wrapper 需要把 mode settings 与 hapi 透传的 session-hook **合并**后再传给 Claude。

创建文件：`$HOME/.hapi/claude-wrappers/hapi-claude`

```bash
#!/bin/bash
# hapi-claude wrapper：让 hapi 可以按 cg/ckh/ck 等模式启动 Claude，
# 复现 ~/.zshrc 中对应函数的行为（版本 + settings + headers patch）。
# 当 hapi 透传自己的 --settings（如 session-hook）时，会将其与 mode settings 合并，
# 避免 session-hook 覆盖掉 provider 相关的 env 配置。

set -euo pipefail

mode="${HAPI_CLAUDE_MODE:-}"

# 如果 mode 未设置，尝试从项目 HAPI_HOME 的 claude-mode 文件读取默认模式
if [[ -z "$mode" ]]; then
  if [[ -n "${HAPI_HOME:-}" && -f "$HAPI_HOME/claude-mode" ]]; then
    mode=$(<"$HAPI_HOME/claude-mode")
    mode="${mode//[[:space:]]/}"
  fi
fi

if [[ -z "$mode" ]]; then
  echo "HAPI_CLAUDE_MODE is not set, falling back to system claude" >&2
  exec claude "$@"
fi

case "$mode" in
  cg)   code=700000; binary="$HOME/.cc-expand/bin/claude-70w"; settings="$HOME/.cp/glm.json" ;;
  ck)   code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/kimi.json" ;;
  ckh)  code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/kimi-highspeed.json" ;;
  ckz)  code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/kimi-zhongge.json" ;;
  ckzh) code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/kimi-zhongge-highspeed.json" ;;
  cks)  code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/kimi-shipeng.json" ;;
  cksh) code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/kimi-shipeng-highspeed.json" ;;
  ckg)  code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/kimi-gaohui.json" ;;
  ckgh) code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/kimi-gaohui-highspeed.json" ;;
  cv)   code=700000; binary="$HOME/.cc-expand/bin/claude-70w"; settings="$HOME/.cp/volc.json" ;;
  cvg)  code=700000; binary="$HOME/.cc-expand/bin/claude-70w"; settings="$HOME/.cp/volc-glm.json" ;;
  cds)  code=700000; binary="$HOME/.cc-expand/bin/claude-70w"; settings="$HOME/.cp/ds.json" ;;
  cdsf) code=700000; binary="$HOME/.cc-expand/bin/claude-70w"; settings="$HOME/.cp/ds-flash.json" ;;
  cmm)  code=700000; binary="$HOME/.cc-expand/bin/claude-70w"; settings="$HOME/.cp/minimax.json" ;;
  cmmf) code=201000; binary="$HOME/.cc-expand/bin/claude-20w1k"; settings="$HOME/.cp/minimax-flash.json" ;;
  cog)  code=700000; binary="$HOME/.cc-expand/bin/claude-70w"; settings="$HOME/.cp/opencode-glm.json" ;;
  coq)  code=270000; binary="$HOME/.cc-expand/bin/claude-27w"; settings="$HOME/.cp/opencode-qwen.json" ;;
  cods) code=700000; binary="$HOME/.cc-expand/bin/claude-70w"; settings="$HOME/.cp/opencode-ds.json" ;;
  *)
    echo "Unknown HAPI_CLAUDE_MODE: $mode" >&2
    exit 1
    ;;
esac

if [[ ! -x "$binary" ]]; then
  echo "Claude binary not found: $binary" >&2
  exit 1
fi

if [[ ! -f "$settings" ]]; then
  echo "Settings file not found: $settings" >&2
  exit 1
fi

# 解析 hapi 透传过来的 --settings（通常是 session-hook），
# 将其与 mode settings 合并，避免 session-hook 覆盖 provider env。
hapi_settings=""
remaining_args=()
i=0
while [[ $i -lt $# ]]; do
  arg="${@:$((i+1)):1}"
  if [[ "$arg" == "--settings" ]]; then
    if [[ $((i+1)) -lt $# ]]; then
      hapi_settings="${@:$((i+2)):1}"
      i=$((i+2))
      continue
    fi
  elif [[ "$arg" == --settings=* ]]; then
    hapi_settings="${arg#--settings=}"
    i=$((i+1))
    continue
  fi
  remaining_args+=("$arg")
  i=$((i+1))
done

# 生成临时 settings，复现 _claude_versioned_settings 的 headers patch
tmpdir=$(mktemp -d)
chmod 700 "$tmpdir"
tmp_settings="$tmpdir/settings.json"

if [[ -n "$hapi_settings" && -f "$hapi_settings" ]]; then
  jq --arg v "$code" -s '.[0] * .[1] | .env.ANTHROPIC_CUSTOM_HEADERS |= sub("claude-cli/[^ ]+"; "claude-cli/" + $v)' "$settings" "$hapi_settings" > "$tmp_settings"
else
  jq --arg v "$code" '.env.ANTHROPIC_CUSTOM_HEADERS |= sub("claude-cli/[^ ]+"; "claude-cli/" + $v)' "$settings" > "$tmp_settings"
fi
chmod 600 "$tmp_settings"

cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

exec "$binary" --settings "$tmp_settings" --dangerously-skip-permissions "${remaining_args[@]}"
```

然后赋权：

```bash
chmod +x "$HOME/.hapi/claude-wrappers/hapi-claude"
```

### 6. 设置项目默认 Claude 模式

runner 在后台为远程会话启动 Claude 时，没有 shell wrapper 来传 `ckh`/`cg` 等模式。因此需要把项目默认模式写到 `$HAPI_HOME/claude-mode`，wrapper 在 `HAPI_CLAUDE_MODE` 为空时会读取它。

```bash
# 例如默认使用 ckh
mkdir -p "$HAPI_HOME"
echo "ckh" > "$HAPI_HOME/claude-mode"
```

之后每次在项目目录内用 `hapi ckh ...` / `hapi cg ...` 等启动，zsh wrapper 都会自动更新这个文件，所以远程会话会跟最近一次本地使用的模式保持一致。

### 7. 配置 zsh wrapper

在 `~/.zshrc` 中添加一个函数，使进入该项目目录后运行 `hapi` 命令自动使用项目级实例，并在 `$HAPI_HOME/url.txt` 写入 app.hapi.run 直连 URL。同时支持：

- 首参数指定 Claude 启动模式（如 `hapi ckh hub --relay`）
- 把 Claude 参数写在 hapi 子命令前（如 `hapi ckh --continue hub --relay`），wrapper 会自动把 Claude 参数挪到子命令后面透传

```zsh
hapi() {
  local project_dir="PROJECT_DIR"
  local hapi_subcommands=(hub runner auth codex gemini opencode mcp connect notify doctor server)
  local mode=""

  # 1. 解析首参数是否为 Claude 启动模式
  case "${1:-}" in
    cg|ck|ckh|ckz|ckzh|cks|cksh|ckg|ckgh|cv|cvg|cds|cdsf|cmm|cmmf|cog|coq|cods)
      mode="$1"
      shift
      ;;
  esac

  # 2. 拆分 Claude 参数与 hapi 子命令参数
  # hapi CLI 要求子命令在前、Claude 选项在后，所以把 Claude 参数挪到子命令后面透传。
  local claude_args=()
  local hapi_args=()
  local found_subcmd=0
  while [[ $# -gt 0 ]]; do
    local is_subcmd=0
    for sub in "${hapi_subcommands[@]}"; do
      if [[ "$1" == "$sub" ]]; then
        is_subcmd=1
        break
      fi
    done
    if [[ $is_subcmd -eq 1 ]]; then
      found_subcmd=1
    fi
    if [[ $found_subcmd -eq 1 ]]; then
      hapi_args+=("$1")
    else
      claude_args+=("$1")
    fi
    shift
  done

  local all_args=("${hapi_args[@]}" "${claude_args[@]}")
  local hapi_home="$project_dir/.hapi"
  local url_file="$hapi_home/url.txt"

  # 如果在项目目录内且指定了模式，把模式持久化到 .hapi/claude-mode，
  # 供 runner 在远程会话中作为默认模式读取。
  if [[ -n "$mode" && "$PWD" == "$project_dir"* ]]; then
    echo "$mode" > "$hapi_home/claude-mode"
  fi

  if [[ "$PWD" == "$project_dir"* ]]; then
    local token=""
    if [[ -f "$hapi_home/settings.json" ]]; then
      token=$(python3 -c "import json,sys; print(json.load(open('$hapi_home/settings.json')).get('cliApiToken',''))" 2>/dev/null)
    fi
    local relay_url=""
    local hub_log="$HOME/Library/Logs/hapi/PROJECT_NAME-hub.log"
    if [[ -f "$hub_log" ]]; then
      relay_url=$(command grep -oE 'https://[a-z0-9]+\.relay\.hapi\.run' "$hub_log" | tail -1)
    fi
    if [[ -n "$token" && -n "$relay_url" ]]; then
      local encoded_hub=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$relay_url', safe=''))")
      echo "https://app.hapi.run/?hub=$encoded_hub&token=$token" > "$url_file"
    fi
    if [[ -n "$mode" ]]; then
      HAPI_CLAUDE_PATH="$HOME/.hapi/claude-wrappers/hapi-claude" \
      HAPI_CLAUDE_MODE="$mode" \
      HAPI_HOME="$hapi_home" \
      HAPI_LISTEN_PORT="HAPI_PORT" \
      HAPI_API_URL="http://localhost:HAPI_PORT" \
      command hapi "${all_args[@]}"
    else
      HAPI_HOME="$hapi_home" \
      HAPI_LISTEN_PORT="HAPI_PORT" \
      HAPI_API_URL="http://localhost:HAPI_PORT" \
      command hapi "${all_args[@]}"
    fi
  else
    if [[ -n "$mode" ]]; then
      HAPI_CLAUDE_PATH="$HOME/.hapi/claude-wrappers/hapi-claude" \
      HAPI_CLAUDE_MODE="$mode" \
      command hapi "${all_args[@]}"
    else
      command hapi "${all_args[@]}"
    fi
  fi
}
```

替换占位符：`PROJECT_DIR`、`PROJECT_NAME`、`HAPI_PORT`。

> 注意：这里使用 `command grep` 绕过可能存在的 `grep` → `rg` shadow，避免正则解析错误。

> 注意：`hapi` CLI 要求 Claude 参数出现在子命令之后，wrapper 会自动重排，因此 `hapi ckh --continue hub --relay` 等价于 `hapi ckh hub --relay --continue`。

### 7. 忽略 .hapi 目录

在项目 `.gitignore` 中加入：

```gitignore
# hapi local instance data (tokens, logs, runtime)
.hapi/
```

### 8. 验证

```bash
cd "$PROJECT_DIR"
hapi runner status        # 应显示 Runner is running
cat .hapi/url.txt         # 应输出 app.hapi.run 直连 URL
hapi ckh hub --relay      # 用 ckh 模式启动项目级 hapi hub（带 relay）
```

## 连接 app.hapi.run

打开 `.hapi/url.txt` 中的 URL，或在浏览器中手动操作：

1. 打开 https://app.hapi.run
2. 点右上角 **Hub (自定义)**
3. 服务器地址填入 relay URL（如 `https://xxxxxx.relay.hapi.run`）
4. 保存
5. 访问令牌填入 `cliApiToken`
6. 登录

如果提示 `Invalid access token`，检查浏览器 localStorage 中的 `hapi_hub_url` 是否与当前项目的 relay URL 一致，不一致则清除 localStorage 或手动切换 Hub。

## Claude 启动模式

zsh wrapper 支持把 `cg`/`ckh`/`ck` 等作为 hapi 的首参数，hapi 会通过 `$HOME/.hapi/claude-wrappers/hapi-claude` 启动对应 settings 的 Claude：

```bash
hapi ckh                 # 用 kimi-highspeed settings 启动 hapi direct-connect
hapi ckh hub --relay     # 用 ckh 模式启动项目级 hapi hub
hapi ckh --continue hub --relay   # 同上，但把 --continue 透传给 Claude
hapi cg runner status    # 用 glm settings 查看 runner 状态
```

由于 hapi CLI 要求 Claude 参数出现在子命令之后，wrapper 会自动把 `--continue` 这类 Claude 参数挪到子命令后面（例如 `hapi ckh --continue hub --relay` 实际调用 `hapi hub --relay --continue`）。

### 远程会话的模式

runner 在后台为远程（app.hapi.run）会话启动 Claude 时，没有 shell 可以传 `ckh`/`cg` 参数，因此它会读取 `$HAPI_HOME/claude-mode` 文件作为默认模式。zsh wrapper 每次在项目目录内使用带 mode 的命令时，都会自动更新这个文件，保证远程会话与最近一次本地使用的模式一致。

如果想手动切换远程默认模式：

```bash
echo "cg" > /path/to/project/.hapi/claude-mode
```

不带模式参数时，hapi 保持默认行为（调用系统 `claude`）。

支持的 mode 与 `~/.zshrc` 中的 Claude 启动函数一一对应：

| mode | code | settings 文件 |
|---|---|---|
| `cg` | 700000 | `~/.cp/glm.json` |
| `ck` | 270000 | `~/.cp/kimi.json` |
| `ckh` | 270000 | `~/.cp/kimi-highspeed.json` |
| `ckz` | 270000 | `~/.cp/kimi-zhongge.json` |
| `ckzh` | 270000 | `~/.cp/kimi-zhongge-highspeed.json` |
| `cks` | 270000 | `~/.cp/kimi-shipeng.json` |
| `cksh` | 270000 | `~/.cp/kimi-shipeng-highspeed.json` |
| `ckg` | 270000 | `~/.cp/kimi-gaohui.json` |
| `ckgh` | 270000 | `~/.cp/kimi-gaohui-highspeed.json` |
| `cv` | 700000 | `~/.cp/volc.json` |
| `cvg` | 700000 | `~/.cp/volc-glm.json` |
| `cds` | 700000 | `~/.cp/ds.json` |
| `cdsf` | 700000 | `~/.cp/ds-flash.json` |
| `cmm` | 700000 | `~/.cp/minimax.json` |
| `cmmf` | 201000 | `~/.cp/minimax-flash.json` |
| `cog` | 700000 | `~/.cp/opencode-glm.json` |
| `coq` | 270000 | `~/.cp/opencode-qwen.json` |
| `cods` | 700000 | `~/.cp/opencode-ds.json` |

## 卸载

```bash
PROJECT_DIR="/path/to/project"
PROJECT_NAME=$(basename "$PROJECT_DIR")
launchctl unload -w "$HOME/Library/LaunchAgents/com.hapi.$PROJECT_NAME.hub.plist"
launchctl unload -w "$HOME/Library/LaunchAgents/com.hapi.$PROJECT_NAME.runner.plist"
rm -f "$HOME/Library/LaunchAgents/com.hapi.$PROJECT_NAME."*.plist
rm -rf "$PROJECT_DIR/.hapi"
# 同时删除 ~/.zshrc 中对应的 hapi() wrapper 段落
```

## 注意事项

- 多个 hapi relay 实例可以共存，tunwg 会自动分配不同子域名。
- token 保存在 `$HAPI_HOME/settings.json` 中，不要提交到 git。
- `.hapi/` 必须加入 `.gitignore`。
- 每个项目实例使用独立端口，避免与全局 hub `3006` 冲突。
