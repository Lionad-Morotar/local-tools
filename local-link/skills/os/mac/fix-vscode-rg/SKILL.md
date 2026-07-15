---
name: fix-vscode-rg
description: 给 VSCode(Insiders/Stable) 内置 ripgrep 加 5s 超时包装，防止搜索卡死吃满 CPU。--on 包装(幂等) / --off 还原 / 不带参数查状态。Use when VSCode 搜索卡死、rg 进程占满 CPU，或 VSCode 更新后超时保护失效需要重包。
disable-model-invocation: true
argument-hints: "--on --off"
---

# fix-vscode-rg

给 VSCode 内置 rg（ripgrep）加 5s 超时包装，防止搜索卡死吃满 CPU。用 `@lionad/bin-timeout-wrapper` 实现：`rg`→`rg_backup`（原二进制），原位生成带 `alarm` 超时的 shell wrapper。原子 rename，可还原。

## 参数

- `--on`：包装 rg，加 5s 超时（幂等，已包装则跳过）。默认行为。
- `--off`：还原原始 rg（移除 wrapper）。
- 不带参数：仅查状态。

## 前置条件（仅首次 / 重新授权时）

macOS Sequoia+ 的 TCC「应用管理 / App Management」保护会拦一切写 `/Applications` 下 app bundle 的操作（owner 是自己也拦，**sudo 也不行**）。必须先给启动终端授权：

1. 系统设置 → 隐私与安全性 → **应用管理**
2. 点「+」添加启动 Claude/终端的 app（Terminal / iTerm / Warp / Ghostty / Kitty 等）
3. 启用开关

验证授权生效（应输出 OK）：

```sh
D="/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/darwin-arm64"
touch "$D/.test" && echo OK && rm -f "$D/.test"
```

若仍 `Operation not permitted`，回到上面授权步骤，确认加对了 app。

## 内置 rg 路径

VSCode 1.122 改过目录结构（`@vscode/ripgrep` → `@vscode/ripgrep-universal/bin/<arch>`，见 microsoft/vscode#318691）：

- **Insiders (Apple Silicon)**：`/Applications/Visual Studio Code - Insiders.app/Contents/Resources/app/node_modules.asar.unpacked/@vscode/ripgrep-universal/bin/darwin-arm64/rg`
- **Stable**：把 `Visual Studio Code - Insiders.app` 换成 `Visual Studio Code.app`
- **Intel Mac**：`darwin-arm64` 换 `darwin-x64`

先确认路径存在再操作；VSCode 大版本升级后可能再变，用 `fd -HI rg "/Applications/Visual Studio Code*.app/Contents/Resources/app/node_modules.asar.unpacked/@vscode"` 定位。

## 执行

设 `RG` 为上面确认的路径。依赖 `bin-timeout-wrapper`（`npm i -g @lionad/bin-timeout-wrapper` 或用 `npx`）。

### --on（包装）

```sh
RG="<上面的路径>"
if bin-timeout-wrapper --status -- "$RG" | command grep -q "^Status: wrapped"; then
  echo "已 wrapped，跳过"
else
  bin-timeout-wrapper --timeout 5 -- "$RG"
fi
bin-timeout-wrapper --status -- "$RG"
```

### --off（还原）

```sh
RG="<上面的路径>"
bin-timeout-wrapper --restore -- "$RG"
```

## 验证超时生效

```sh
RG="<上面的路径>"
BIN_TIMEOUT=1 "$RG" --files /System >/dev/null 2>&1; echo "exit=$? (期望 137)"
```

`exit=137`（128+9 SIGKILL）= 超时杀进程生效。VSCode 不需重启——每次搜索按需 spawn rg，下次 `Ctrl+Shift+F` 即走 wrapper。

## 失效与重包

VSCode 每次更新会在 rg 包版本变化时用原始二进制覆盖 wrapper。**更新后若搜索又卡死，重新 `--on` 即可。**（Insiders 更新频繁，建议留意。）

## 为什么不用 search.rgPath

VSCode **不支持** `search.rgPath` setting——app bundle 全文 0 命中，rg 路径硬编码从 `@vscode/ripgrep-universal` 解析。在 settings.json 配它无效。只能改 app bundle 内的 rg 本身，这也是本 skill 的原理。
