---
name: flow-north-star-loop
description: lionad 的北极星循环——在 production-ready 项目上以可配置 cadence 自动驱动开发循环：从北极星目标分解 epic、调度 flow-dev/ui-ralph 产出 slice、顺序合并累积、攒够 patch/minor 后暂停等用户 e2e 发版
argument-hint: [--cadence 1h] [--now] [--resume] [--pause] [--new-direction] [--light]
---

## 要求

* 本技能的状态文件（`.nsl/state.json`）默认不进入 git（写入项目根 `.gitignore`），每次写入前备份到 `.nsl/state.json.bak`
* 循环靠 durable Cron 驱动，**只在 REPL idle 时触发**；触发时若上一轮仍在进行（`phase=developing`）则该轮检查看门狗后 no-op 跳过，等下个周期
* 严格按照流程执行，碰到阻塞按清单解决：
  * 进入了计划模式等待确认：自动确认（先计划再自动确认，不是不做计划）
  * 有决策需要确认：回答永远是“按照文档高标准质量决定”
  * **不要暂停**：自动轮内完成全部阶段，get all shits done
* 根据阶段要求读取执行对应技能（flow-dev / flow-ui-ralph / release-project），不在初始化时一口气读取
* **人类控制点**（不自动确认，必须 Ask）：epic 启动前展示“拟选方向 + 验收信号 + 预期 slice 数 + 预算”，用户可否决或授权（`--yes` 跳过）。目标设定（`north-star.md`）与发布权（test→main、打 tag）始终在人手里
* 唯一的自动暂停点是 step 7（顺序合并到 test 后 CronDelete）——把控制权交还用户做 e2e 与发版

## 核心概念

### 三层结构

| 层 | 载体 | 说明 |
|---|---|---|
| L0 北极星目标 | `docs/north-star.md`（人工维护） | 长期愿景，定“去哪儿”；人类保留目标设定权 |
| L1 epic（宏伟方向） | `feat/nsl-epic/<epic>` 分支 | 一组相关 slice 的容器；顺序合并创建 |
| L2 slice（单轮开发） | `feat/nsl/<epic>/<slice-YYYYMMDD-NN>` 分支 | 一次 flow-dev/ui-ralph 的产物，命名含日期+序号保唯一 |

方向选择：从 `docs/north-star.md` 的愿景池挑方向（**仅 active 目标**，过滤 completed/deprecated），结合项目状态（changelog/issues）。cadence 越大，AI 越敢选宏伟方向（定性指引，不设数值档位），但受 epic 预算上限约束。

### 状态机（phase）

每次 cron 触发，第一步读 `state.json` 的 `phase` 做门控：

| phase | 含义 | 触发时动作 |
|---|---|---|
| `idle` | 空闲，可开新一轮 | 进入 step 3，置 `developing` |
| `developing` | 上一轮仍在跑 | **检查看门狗**：`developing_since` 超 30min 或被跳过 ≥3 次 → 判死锁，CronDelete + paused + 通知；否则 no-op 跳过 |
| `awaiting-e2e` | 已合并到 test，等用户 e2e 发版 | no-op（cron 本应已删，防御性跳过） |
| `paused` | 用户主动 `--pause` | no-op |

**转换图**：

```
idle ──(cron/--now)──▶ developing ──(单轮完成)──▶ idle
idle ──(epic 入 pending，够 patch/minor)──▶ 合并到 test → awaiting-e2e
awaiting-e2e ──(--resume)──▶ idle
任意态 ──(--pause)──▶ paused（记录 paused_phase）──(--resume)──▶ 精确恢复 paused_phase
```

**字段更新规则**：

| 时机 | 字段更新 |
|---|---|
| 开新 epic（step 3 选定新方向） | `current_epic` = 新 epic 名；`epics` 追加 `{name, status:active, slices:[], budget:{max_slices,max_age_h}, started_at}` |
| 进入 developing | `current_slice` = 本轮分支；`phase` = developing；`developing_since` = 当前时间 |
| 单轮完成回 idle | `phase` = idle；成功则 `failures` = 0；清 `developing_since` |
| epic 结束 | `epics[epic].status` = merged；`pending_release` 追加 epic；`current_epic` = null |
| 合并到 test | `phase` = awaiting-e2e |
| `--pause` | `paused_phase` = 当前 phase；`phase` = paused；CronDelete |
| `--resume` | **先 `CronDelete(state.cron_id)`**；`phase` = `paused_phase || idle`；awaiting-e2e 恢复时清空已发布的 `pending_release` |
| 单轮失败 | `failures` +1（仅 logic 类累计）；记 history（含 `failure_type`） |

`developing` / `awaiting-e2e` / `paused` 时触发：no-op，不改动任何字段（除看门狗判死锁）。

### cadence 语义

`--cadence` = 两轮起点的最小间隔（cron 绝对周期），**不是**两轮之间的纯休息。开发耗时 > cadence 时，busy 的周期被跳过，实际节奏由开发耗时决定——预期行为。

#### cadence → cron 换算

统一用 7 分偏移避开整点：

| cadence | cron 表达式 |
|---|---|
| 30m | `7,37 * * * *` |
| 1h（默认） | `7 * * * *` |
| 2h | `7 */2 * * *` |
| 1d | `7 0 * * *` |

不在表中的 cadence：取不超过它的表内值，或在 step 1 拒绝并提示用标准档位。

### 合并拓扑（顺序合并优先，章鱼仅限无重叠）

* **slice 基于前序切出**：新 slice 从当前 epic 的最新集成分支（或前一个 slice）切出，**不基于 main**——保证 slice 间增量可见，避免末期冲突大爆炸。仅当 slice 真正独立（无文件重叠）时才允许基于 main
* **slice → epic（顺序两路合并）**：epic 收尾时，按 slice 顺序逐个 `merge --no-ff` 进 `feat/nsl-epic/<epic>`，遇冲突逐条解决（**不用章鱼**——git octopus 遇任何冲突整体 abort，无法逐条解决）
* **单 slice epic 退化**：仅 1 个 slice 时，直接将该 slice 分支作为 epic 分支
* **epic → test（顺序两路合并）**：累积收尾时，完成的 epic 按顺序 `merge --no-ff` 进 `test`（test 不存在则基于 main 创建）。**仅当确认所有 epic 互无文件重叠时**才允许章鱼合并作为快捷手段；默认顺序合并
* **合并前门控**：每次 merge 前跑快速门控（`tsc --noEmit` / `test:unit` / lint / build），失败则暂停告警，不计入普通“单轮失败”

### 收尾判定（累积 + 预算）

每次 epic 完成（顺序合并成 epic 分支）后，评估 `pending_release` 是否够一次 patch/minor：patch = 累积若干 fix/小改；minor = 至少一个完整新功能 epic。够 → 顺序合并到 `test` + CronDelete 暂停 + 通知 e2e；不够 → 继续下个 epic。

**epic 预算**（防永不结束）：每个 epic 声明 `max_slices`（默认据 cadence：30m→2, 1h→5, 2h→10, 1d→20）与 `max_age_h`（默认 48h）。超限时强制升级到人类决策（Ask：继续追加 / 拆分 / 放弃）。

## 状态文件

`<project>/.nsl/state.json`（gitignore，写前备份 `.bak`）：

```json
{
  "phase": "idle",
  "cadence": "1h",
  "project_path": "<项目绝对路径，cron 触发时校验 cwd 一致>",
  "cron_id": "<CronCreate 返回的 job id>",
  "cron_created_at": "<ISO，用于 7 天续期判断>",
  "current_epic": "<epic 名 | null>",
  "current_slice": "<slice 分支名 | null>",
  "developing_since": "<ISO | null，看门狗>",
  "paused_phase": "<pause 前的 phase | null>",
  "epics": [{ "name": "...", "status": "active|merged", "slices": ["..."], "budget": {"max_slices": 5, "max_age_h": 48}, "started_at": "..." }],
  "pending_release": ["<已合成 epic 分支、待累积收尾的 epic 名>"],
  "history": [{ "ts": "...", "action": "...", "detail": "...", "failure_type": "env|conflict|logic|null" }],
  "failures": 0
}
```

**读取校验**：JSON 合法性 + 字段默认值补全；损坏则从 `.bak` 恢复或报错要求 `--reset`。

**初始化**（step 0 首次启动）：

```json
{
  "phase": "idle",
  "cadence": "<传入的 --cadence 或 1h>",
  "project_path": "<项目绝对路径>",
  "cron_id": null,
  "cron_created_at": null,
  "current_epic": null,
  "current_slice": null,
  "developing_since": null,
  "paused_phase": null,
  "epics": [],
  "pending_release": [],
  "history": [],
  "failures": 0
}
```

step 1 启动 cron 后回填 `cron_id` 与 `cron_created_at`。

## 北极星目标文件

`<project>/docs/north-star.md`，结构化愿景清单。每个目标至少含：名称、愿景描述、验收信号（必须可量化或明确完成态）、优先级、状态（active / completed / deprecated，默认 active）。AI 只从 active 目标挑选，跳过 completed/deprecated；无 active 目标则提示用户补充。验收信号用于 step 6 判定 epic 结束 + 防 never-ending。模板见 `references/north-star-template.md`。

## Workflow

**入口分流**：每次被调用（cron / `--now` / `--resume` / 手动），先读 `<project>/.nsl/state.json`——存在 → step 2；不存在 → step 0。cron 触发时校验 cwd 与 `project_path` 一致，不一致则 no-op（防切目录误触发）。

0. **初始化上下文**（仅首次，无 `state.json` 时）
   - [ ] 确认 production-ready：有 `package.json` + `CHANGELOG.md` + git + 工作区干净 + 当前在 `main`（不在 main 则提示并自动 `git checkout main`）
   - [ ] 确认项目 `docs/north-star.md` 存在；不存在则从技能 `references/north-star-template.md` 复制并引导填写后再继续
   - [ ] 初始化 `<project>/.nsl/state.json`（按上 schema，含 `project_path`）
   - [ ] 将 `.nsl/` 写入项目 `.gitignore`（无则创建；未忽略则追加）
   - [ ] 使用 Ask 询问“是否立即进入首轮开发”：是 → 走 step 2 入口（置 developing）启动首轮，首轮结束后走 step 1；否 → 先走 step 1 启动 cron

1. **启动 cron**（durable，绑项目路径）
   - [ ] `--cadence` 换算为 cron 表达式（避开整点）
   - [ ] `CronCreate({ cron, durable: true, prompt: "/flow-north-star-loop" })`，记录 `cron_id` 与 `cron_created_at`
   - [ ] cron 触发时靠 `project_path` 校验 cwd（防多项目/切目录误触发）
   - [ ] 提醒：recurring cron 7 天自动过期，临期（第 6 天）提醒续期

2. **每轮触发入口**（cron 自动 / `--now` 手动）
   - [ ] 读 `state.json`（校验 + 备份），按 phase 门控表决定动作
   - [ ] `developing` → 检查看门狗（超 30min 或跳过 ≥3 次 → 死锁暂停）；否则 no-op
   - [ ] `awaiting-e2e`/`paused` → no-op 退出
   - [ ] 检查工作区干净；不干净 → 跳过该轮（不 stash），记 history
   - [ ] phase=idle → 置 developing（写 `developing_since`），用 Task 工具创建本轮 step 3-7 外层任务

3. **选择方向 + 建 slice 分支**
   - [ ] 读 `docs/north-star.md` 愿景池（**仅 active 目标**）+ 项目状态
   - [ ] 据 cadence 定性映射 + epic 预算，选 epic（新开或继续当前未完成）
   - [ ] **新 epic 启动前 Ask**：展示拟选方向 + 验收信号 + 预期 slice 数 + 预算（max_slices/max_age_h），用户否决或授权
   - [ ] 开新 epic：声明 epic 名、目标、验收信号、预算；置 `current_epic`
   - [ ] 创建 `feat/nsl/<epic>/<slice-YYYYMMDD-NN>`：**从当前 epic 最新集成分支（或前一个 slice）切出**，非 main；创建前检查分支不存在

4. **调度开发技能**
   - [ ] UI/视觉 → `flow-ui-ralph`；纯逻辑 → `flow-dev`；混合 → `flow-dev` 为主 + `flow-ui-ralph` 收尾
   - [ ] 透传 `--light`
   - [ ] 开发完成后回到本流程

5. **更新 changelog（片段，不打标）**
   - [ ] 本轮 slice 只写片段到 `.nsl/changelog.d/<slice>.md`（避免每轮改同一份 CHANGELOG 致合并冲突）
   - [ ] epic 结束时（step 6）合并片段 + 调用 `release-project --changelog-only` 写入 `[Unreleased]`
   - [ ] 确认未升级版本、未打 tag、未推送、未切分支

6. **评估单 epic 是否结束 + 顺序合并**
   - [ ] **量化判定**：取 epic 全部验收信号，逐条对照最终报告 + PRD 验收点；超预算 → 升级人类决策
   - [ ] 未结束 → 置 phase=idle，等 cadence 继续**此 epic**（回 step 2）
   - [ ] 结束 → **合并前门控**（tsc/test:unit/lint/build），失败暂停告警
   - [ ] 门控通过 → 按 slice 顺序逐个 `merge --no-ff` 成 `feat/nsl-epic/<epic>`（遇冲突逐条解决）；合并片段 + `release-project --changelog-only` 写 [Unreleased]；epic 入 `pending_release`；置 phase=idle

7. **评估累积收尾**（每次 epic 入 pending_release 后）
   - [ ] 评估 pending_release 是否够 patch/minor
   - [ ] 不够 → 回 step 2 继续下个 epic
   - [ ] 够 → **合并前门控**；通过 → 顺序合并这批 epic 到 `test`（不存在则基于 main 创建；仅确认无重叠才章鱼）
   - [ ] `CronDelete(cron_id)` 暂停，置 phase=awaiting-e2e
   - [ ] 通知用户：test 就绪，请 e2e，完成后 `release-project` 发版（含 test→main），发版后喊 `/flow-north-star-loop --resume`

8. **用户 e2e 与发版**（人机切换，loop 暂停）
   - [ ] 用户在 `test` 端到端验证
   - [ ] 用户调用 `release-project`（不带 --changelog-only）：1.6 test→main → 版本号升级 → 打 tag → 推送
   - [ ] 此阶段 loop 不介入

9. **恢复 loop**
   - [ ] 用户喊 `/flow-north-star-loop --resume`
   - [ ] **先 `CronDelete(state.cron_id)`**（防重复 cron），再重建
   - [ ] 读 state.json，`phase` = `paused_phase || idle`（精确恢复），清空已发布的 `pending_release`（awaiting-e2e 恢复时）
   - [ ] 回 step 1 重建 cron（兼作续期）

## 控制参数

| 参数 | 作用 |
|---|---|
| `--cadence <dur>` | 触发间隔，默认 1h（30m / 2h / 1d） |
| `--now` | 手动轮，立即推进一轮，走 step 2 入口 |
| `--resume` | 先 CronDelete 旧 cron，再断点续传（精确恢复 paused_phase）+ 重建 cron |
| `--pause` | CronDelete 暂停，记录 paused_phase，置 phase=paused |
| `--new-direction` | 强制切换新方向（即使当前 epic 未结束） |
| `--light` | 透传给底层 flow-dev，轻量开发少落档 |

## 错误处理与运维

* **单轮失败**：记 history + 分类（env / conflict / logic）；`failures+1` 仅对 logic 类累计
* **单轮成功**：`failures` 重置 0
* **连续 3 轮 logic 失败**（`failures≥3`）：CronDelete + paused + 通知
* **conflict 类失败**：先重试或切换顺序合并逐条解决，不立即累计 failures
* **developing 看门狗**：`developing_since` 超 30min 或被跳过 ≥3 次 → 判死锁，CronDelete + paused + 通知
* **合并前门控失败**（tsc/test/lint/build）：暂停该步，记 history，不计入 failures
* **合并冲突**：用顺序两路合并逐条解决（章鱼仅无重叠时用）
* **state.json 损坏**：从 `.bak` 恢复；无备份则报错要求 `--reset --keep-history`
* **cron 7 天过期**：state 记 `cron_created_at`，第 6 天提醒续期；过期后 `--resume` 重建
* **多项目并存**：每项目独立 `.nsl/state.json`（含 `project_path`）+ 独立 cron，触发时校验 cwd
