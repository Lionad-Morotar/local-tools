# close-host-window 扩展机制参考

close-cc-host 的解耦文档。沉淀扩展方案的技术细节，**以扩展实现为准**（项目 `~/Github/Lionad-Morotar/vscode-extension-for-agent` 的 `src/`）。

## 为什么必须扩展（外部操作窗口的死路）

外部进程定位/操作 VSCode 某个窗口的公开路径全废：

| 死路 | 实测死因 |
| --- | --- |
| AppleScript `close window` | VSCode（Electron）不实现 AppleScript 字典，`-1708`/`-1728` |
| 激活 + ⇧⌘W 快捷键 | 激活抢用户焦点；依赖全局焦点 |
| AX `AXPress` 关闭按钮 | AX 受 onscreen/Space 过滤，跨桌面窗口看不到 |
| kill renderer | `kCGWindowOwnerPID` 是主进程不是 renderer；映射在主进程内存 |
| CGS / SkyLight 私有 API | 需关 SIP + 注入 Dock；"撕窗口表面"留僵尸 renderer |
| `code` CLI 关窗 | 无此子命令 |
| `VSCODE_IPC_HOOK` 逆向 | 服务端动词表无 close-window |

唯一架构正确的路 = 扩展。

## 信号分档（claude 退出可靠性，实测 + issue 证据）

关闭 claude 所在 terminal/host，关键不是"怎么关"，而是"claude 怎么退出才能走完 hooks"。信号分档：

| 信号 | 触发场景 | SessionEnd / hooks | 可靠性 |
| --- | --- | --- | --- |
| `/exit`（prompt_input_exit） | 用户正常退出 | 完整触发 | ✓ 可靠 |
| **SIGTERM** | `kill -TERM <pgid>` | handlers 跑、SessionEnd 触发（实测同秒） | ✓ 可靠 |
| SIGHUP | terminal dispose / 关 pty | SessionEnd 触发但 fire-and-forget | ✗ 不可靠 |
| SIGKILL | `claude rm/stop`、OOM、强杀 | 完全跳过（atexit/handlers 都不跑） | ✗ 丢失 |

实测（隔离 `claude -p` + SessionEnd hook + SIGTERM）：claude 运行中被 SIGTERM → 同秒 SessionEnd 触发 → 优雅退出。SIGKILL 则 handlers 全不跑（anthropics/claude-code#62987 的 git index.lock 实证：atexit/SIGTERM/SIGHUP/SIGINT handler 在 SIGKILL 下全不触发）。

**结论**：`terminal.dispose()` 走 SIGHUP/SIGKILL 区间，不可靠。必须显式 SIGTERM。

## 扩展机制（正解）

三个 VSCode 事实叠加：

1. **每窗口独立 extension host 进程**（per-window）
2. **`workbench.action.closeWindow` 关宿主窗口本身**，不抢焦点、不受 Space 限制、不动鼠标
3. **`environmentVariableCollection`**（`persistent=false`）注入本窗口新终端 per-window 环境变量

"25 窗口精确路由到 1 个"由进程模型消解。

## CloseAction 流程（SIGTERM 优雅退出，两段式终止）

扩展 `CloseAction.trigger(reason, host)`：

1. 拿活动终端 `processId`（shell PID，session leader，pgid=pid）
2. `kill -TERM -<pgid>`（SIGTERM 进程组，含 claude）→ claude 走 SessionEnd（hooks 跑完）
3. `waitForProcessExit`（poll `kill -0`，5s 宽限期）
4. 按 host 关闭（claude 已退出，清理无 hooks 风险）：
   - `vscode` → `workbench.action.closeWindow`
   - `terminal` → `activeTerminal.dispose()`（清面板，claude 已退出）

超时未退则继续关闭（claude 可能卡死）。SIGTERM 失败不阻断（catch 后继续关）。

## 双通道触发

**socket 通道**（vscode 专用，新终端精度主力）：

- `makeSocketPath(sessionId)`（hash 化，见 SUN_LEN）→ `net.createServer` 监听
- `environmentVariableCollection.replace('VSC_WINDOW_CLOSE_HOOK', socketPath)` 注入新终端
- 终端 `nc -U "$VSC_WINDOW_CLOSE_HOOK" </dev/null` → `trigger('socket', 'vscode')`

**哨兵通道**（老终端兜底 + terminal 专用）：

- 两枚：`.vscode/.close-window-signal`（→ vscode）、`.vscode/.close-terminal-signal`（→ terminal）
- `createFileSystemWatcher` 每窗口只 watch 自己 workspace，25 窗口只有 workspace 匹配的响应
- 终端 `touch` 哨兵 → `trigger('sentinel', host)`（扩展先删哨兵再关，防误触发）

> terminal 只走哨兵（socket 固定 vscode）。dispose 活动终端不需 per-window socket 精度（活动即当前窗口）。

## --host 路由 + 容器层级

```
VSCode 窗口 ⊃ 终端面板 ⊃ claude
```

- `--host vscode`：关窗口（连带所有终端面板 + claude）→ closeWindow
- `--host terminal`（默认）：只关活动终端面板（claude 随之退出，窗口保留）→ dispose activeTerminal

对参数路由无影响，仅最后一步不同；前置 SIGTERM 优雅退出完全一致。close.sh 据此选 socket / 哨兵。

## socket 路径 SUN_LEN（已修）

macOS unix socket 路径受 SUN_LEN 限制（104 含 null）。`vscode.env.sessionId` 是 36 UUID + 13 时间戳（49 字符），叠 mac `os.tmpdir()`（~47）会超 104 触发 `listen EINVAL`。修复：`makeSocketPath` 取 sessionId sha256 前 12 hex，路径降到 ~74。

> 此 bug F5 dev host 测不出（sessionId/tmpdir 更短），生产才暴露。

## 关联机制（reload 后自动重连）

cc 不主动找 socket —— 扩展通过环境变量主动告诉 cc：

- activate 时注入 `$VSC_WINDOW_CLOSE_HOOK`（socket 路径）到本窗口新终端
- reload 后 sessionId 变 → socket 变，扩展重新注入到新终端
- 老终端（环境变量启动时定型）→ 走哨兵

本质是控制反转：外部进程没法主动定位扩展窗口，扩展主动暴露 per-window 入口。

## 激活前置

- `activationEvents: ["onStartupFinished"]`：装扩展后必须 reload（或开新窗口）。
- **Workspace Trust**：`/tmp` 等不可信 workspace 限制激活，无报错。

## 何时更新

- 扩展行为变化（变量名、哨兵路径、socket 命名、CloseAction 流程）
- claude code 信号行为变化（SIGTERM/SIGHUP 对 SessionEnd）
- VSCode 改 extension host 模型 / Workspace Trust
