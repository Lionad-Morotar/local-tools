---
name: close-cc-host
description: 关闭承载当前 Claude Code 会话的宿主（VSCode 窗口或其终端面板），连同 claude 一起退出。通过 close-host-window 扩展触发：先 SIGTERM claude（走完 SessionEnd hooks）再关 host，不抢焦点、不丢 hooks。--host vscode 关窗口、--host terminal（默认）只关终端面板。Use when 任务结束要随宿主退出，或需精确关闭某 claude 终端所在窗口/面板。
disable-model-invocation: true
argument-hints: "[--host vscode|terminal]"
---

# close-cc-host

关闭承载当前 claude 会话的**宿主**（VSCode 窗口 ⊃ 终端面板 ⊃ claude），连同 claude 一起退出。靠 **close-host-window 扩展**完成，且**先 SIGTERM claude 走完 SessionEnd hooks 再关 host** —— 直接 dispose terminal 是强杀，会丢 hooks。

## 核心原理

外部进程没法主动定位/操作 VSCode 窗口（AX 跨 Space 失明、激活抢焦点、CGS/IPC 死路）。扩展可以 —— per-window extension host + `workbench.action.closeWindow`（不抢焦点、不受 Space 限制）。

但扩展直接 `terminal.dispose()` 是强杀（SIGHUP/SIGKILL），claude 的 SessionEnd/Stop hook 会丢。正确顺序：**SIGTERM claude 进程组（优雅退出，SessionEnd hooks 跑完）→ 等退出 → 再关 host**（Docker/k8s/systemd 标准两段式终止）。

## 前置条件（缺一则静默失败）

1. 装 **close-host-window** 扩展（vsix 本地装；项目 `~/Github/Lionad-Morotar/vscode-extension-for-agent`）
2. `Cmd+Shift+P` → `Developer: Reload Window` 激活（`onStartupFinished` 只在窗口启动触发一次）
3. workspace **可信**（`/tmp` 等不可信 workspace 扩展不激活）

## 触发

```sh
bash scripts/close.sh                 # 默认 --host terminal，只关活动终端面板
bash scripts/close.sh --host vscode   # 关整个窗口（连带所有终端面板）
```

`--host` 路由（两层都先 SIGTERM claude 走 SessionEnd，再关）：

- **vscode**：socket（新终端 `$VSC_WINDOW_CLOSE_HOOK`）或哨兵 `.close-window-signal`（老终端）→ closeWindow
- **terminal**（默认）：哨兵 `.close-terminal-signal` → dispose 活动终端面板

## 隐藏语义（容器层级）

VSCode 窗口 ⊃ 终端面板 ⊃ claude。`--host vscode` 关顶层窗口（连带 terminal + claude）；`--host terminal` 只关中间层终端面板（claude 随之退出，窗口保留）。对参数路由无影响，仅交代嵌套关系。

## 关联机制（cc 怎么找到本窗口的扩展）

cc 不主动找 —— 扩展通过 `environmentVariableCollection` 把本窗口 socket 路径注入新终端的 `$VSC_WINDOW_CLOSE_HOOK`（vscode 通道）；老终端走哨兵。reload 后 sessionId 变但环境变量自动重铺。详见 [references/vscode.md](references/vscode.md)。

## 坑位（实测血泪）

- **装扩展后必须 reload**：`onStartupFinished` 只在窗口启动触发一次。
- **Workspace Trust 拦截**：`/tmp` 等不可信 workspace 扩展不激活，且无报错。
- **直接 dispose = 强杀 = 丢 hooks**：扩展已改为 SIGTERM 优雅退出，别绕过扩展直接 kill pty。
- **老终端无 `$VSC_WINDOW_CLOSE_HOOK`**：环境变量启动时定型 → 哨兵兜底。
- **哨兵通道一触即发**：`touch .close-*-signal` 在真 workspace 下立即触发关 host。验证务必在 `mktemp -d` 隔离目录跑。
- **关闭即终止当前会话**：close.sh 必须最后一条，commit / 存盘提前做完。

## 解耦

信号分档（SIGTERM/SIGHUP/SIGKILL）+ 扩展机制（per-window host、双通道、SIGTERM 优雅退出）+ 关联机制 + 激活前置 → [references/vscode.md](references/vscode.md)
