---
name: flow-ui-ralph
description: lionad 的 UI 还原迭代流程，通过视觉分析与浏览器验证将项目产物还原到 99% 以上
---

## 要求

* 本技能输出的文档默认不进入 git
* 严格按照流程执行，如果碰到以下阻塞按照清单解决问题：
  * 进入了计划模式，生成了计划并等待我确认：你应当自动确认计划（注意，并非不做计划！而是先计划然后自动确认）
  * 有决策需要我确认：我的回答永远是 “按照文档高标准质量决定”
  * **不要暂停**：完成所有阶段，而不是分阶段汇报向我确认，get all shits done
* **务必按照要求读取执行对应技能**：即 `~/.claude/skills/<skill-name>/SKILL.md`
* 本流程不使用逐像素对比器，所有差异分析必须通过视觉分析工具完成
* 每次迭代必须基于真实浏览器截图等产物进行端到端验证
* 将 UI 还原视为 **V-Zone 细节对比 ↔ 整页回归对比** 的双向 rough loop：先在局部验证精致细节，再在整体验证布局、氛围与一致性，整页出现问题时重新回到局部
* **收敛检查点**：若连续 3 轮迭代后 V-Zone 或整页得分均无实质提升，必须停止当前实现路径，记录残留差异并**更换策略**（例如从 CSS 模拟切换到真实 WebGL、从静态贴图切换到动态环境贴图），禁止在同一维度继续微调参数。若累计更换 5 次策略后仍无实质提升，则记录最终残留差异并进入最终报告。

## 推荐工具

### 视觉分析

根据当前模型选择视觉分析方式：

* **kimi-for-coding**：直接使用 `Read` 工具读取图片/视频，利用模型原生多模态能力进行分析
* **GLM / DeepSeek**：使用 `mcp__glm-image-mcp-server__*` 或 `mcp__kimi-tools-mcp__kimi-image` 辅助理解图片

输入：当前实现截图 + 目标设计稿 / 参考图
输出：差异列表 + 还原度得分（0-100）

### 浏览器自动化

使用 `kimi-webbridge` 技能对本地或线上项目进行真实浏览器截图、滚动、交互。

## 核心概念

### 可验证区域（Verification Zone，V-Zone）

V-Zone 是页面中可独立截图、独立评分、独立修复的最小 UI 单元。

* 示例：一个卡片、一个按钮组、一个表单项、一个图表、一个导航栏、一个弹窗头部
* 每个 V-Zone 必须包含：
  * 名称与选择器（如 `.hero-card`、`.search-form`）
  * 对应的目标素材截图或目标图中的区域
  * 验收标准（字体、颜色、间距、阴影、圆角、图标、状态等）
  * 当前实现截图
  * 还原度得分
  * 差异列表

### 双向 Rough Loop

还原过程不是一次性整页对比，而是在两个粒度之间循环：

1. **V-Zone Loop**：对每个小区域截图，与目标局部对比，修复细节问题
2. **整页 Loop**：当所有 V-Zone 得分达到阈值后，回到整页截图，验证布局、留白、响应式、氛围与一致性
3. **回退机制**：若整页对比发现问题，将问题定位到具体 V-Zone，重新进入 V-Zone Loop
4. 如此反复数轮，直到 V-Zone 与整页均通过

## 截图策略

| 截图类型 | 用途 | 工具 |
|---|---|---|
| 整页截图 | 布局、留白、响应式、氛围、滚动位置 | `kimi-webbridge` 全页截图 |
| 元素级截图 | 字体、颜色、间距、阴影、圆角、图标、边框 | `kimi-webbridge` `-e <selector>` |
| 视频/GIF | 动画、过渡、微交互 | 录屏工具 |
| 动态/3D 元素截图 | 占满视口的 3D 背景、反射、形变动画 | 录屏后抽帧，或用 `evaluate` 截取固定 clip 区域 |

**原则**：精致细节必须通过元素级截图验证，不能仅依赖整页截图的视觉分析。每次截图前应对页面执行硬刷新（`location.reload()`）并等待稳定，避免热重载导致的布局/样式漂移。

## V-Zone 验收标准模板

每个 V-Zone 至少检查以下维度：

* Typography：字体、字号、字重、行高、字间距
* Color：背景色、文字色、边框色、渐变、透明度
* Layout：宽高、padding、margin、gap、对齐方式
* Shape：border-radius、border-width、shadow
* Asset：图标、图片是否加载、是否清晰、是否有锯齿
* State：hover、focus、active、disabled、empty、error
* Motion：过渡时长、缓动曲线、延迟
* Dynamic / 3D：对于依赖 HDR、反射、形变动画的元素，以多帧代表样 + 氛围一致性为主要评分依据，而非单帧像素级对比

## 目录结构

所有产物统一存放在 `<working-dir>/docs/ui/<taskname>/` 下：

```
<working-dir>/docs/ui/<taskname>/
├── target/                    # 最终目标素材
│   ├── fullpage.png           # 完整目标图
│   └── zones/                 # 拆分的 V-Zone 目标图
│       ├── hero-card.png
│       └── search-form.png
├── iterations/
│   ├── 000-baseline/          # 首次基线截图
│   │   ├── fullpage.png
│   │   └── zones/
│   ├── 001/                   # 第 1 轮迭代产物
│   │   ├── fullpage.png
│   │   └── zones/
│   ├── 002/
│   └── .../
├── qa/                        # 每轮迭代发现的 Bugs
│   ├── iteration-001.md
│   ├── iteration-002.md
│   └── .../
└── reports/
    └── ui-ralph-report.md     # 最终报告
```

## Workflow

0. 使用 Task 工具执行以下几个步骤：
1. **准备目标素材**：从用户输入或上下文中提取并整理最终目标 FinalTarget，保存到 `<working-dir>/docs/ui/<taskname>/target/`。目标不仅包括可见的 UI 设计稿、图片、参考链接，还必须覆盖可能的隐形的 UX 检查点：
   * **资产提取**：若用户已明确授权本地使用目标站字体、HDR、视频等付费/私有资产，应自动将其下载到项目 `assets/` 或 `zRefs/`，并在报告中注明授权范围。无需再次向用户确认。
   * 加载状态（Loading / Skeleton）
   * 空状态（Empty）
   * 报错状态（Error / 表单校验 / 业务错误）
   * 网络错误状态（Offline / Timeout / Retry）
   * 鼠标交互状态（Hover / Active / Focus / Disabled）
   * 键盘交互状态（Focus order / 快捷键 / 回车提交 / ESC 关闭）
   * 响应式断点与动画/过渡表现
   * 若目标素材未明确给出某状态，则基于项目已有代码、设计系统、可访问性最佳实践推断该状态的验收标准
   * **识别 V-Zone**：分析 `target/fullpage.png` 或目标素材，识别出所有可验证区域，为每个 V-Zone 定义：
     * 序号（从 1 开始）
     * 名称与用途（如 `hero-card`）
     * 建议截图范围（如 "首屏 Hero 卡片区域"）
     * 验收标准
   * **输出 V-Zone 清单**：在终端以编号列表形式输出所有 V-Zone，提示用户按顺序逐个截图并粘贴到目标文件夹。示例：
     ```
     请按以下顺序截取 V-Zone 目标图并粘贴到...：
     1. hero-card — 首屏 Hero 卡片区域
     2. search-form — 顶部搜索表单
     3. feature-grid — 特性卡片网格
     ```
   * **接收并自动命名用户截图**：用户粘贴的图片文件名可能为 `Image_2.png` 等系统随机名，agent 必须忽略原始文件名，按用户粘贴顺序自动重命名为 `target/zones/<zone-name>.png`。所以等用户确认继续后，立即分析文件名并重命名。
2. **文档澄清**：针对 FinalTarget 执行 `grill-with-docs` 技能，当问询结束后，使用 `to-prd` 技能把 PRD 文档沉淀到 `<working-dir>/docs/plans/xxx`
3. **建立基线（Baseline）**：使用 `kimi-webbridge` 技能对当前项目进行首次截图，保存到 `<working-dir>/docs/ui/<taskname>/iterations/000-baseline/`：
   * 一张整页截图 `fullpage.png`
   * 对每个 V-Zone 执行元素级截图，保存到 `zones/<zone-name>.png`
   * 记录每个 V-Zone 的初始还原度得分
4. **双向 Rough Loop 迭代还原**（最多 30 turn，如 0~30）：
   4.1 **V-Zone Loop**：
      * 选择当前得分最低、或处于关键视觉路径、或会影响其他区域的 V-Zone
      * 对该 V-Zone 选择器执行元素级截图
      * 将该 V-Zone 截图与 `target/zones/` 中对应目标图对比
      * 输出该 V-Zone 的差异列表和得分
      * 根据差异生成修复任务 Bugs，写入 `qa/iteration-<iteration-no>.md`
      * 自动修改代码，无需我确认，重新验证该 V-Zone 及可能受影响的相邻 V-Zone
      * 重复直到所有 V-Zone 得分 ≥ 99%（或达到本轮收敛条件）
   4.2 **整页 Loop**：
      * 当所有 V-Zone 得分达标后，截取整页图
      * 将整页截图与 `target/fullpage.png` 对比
      * 输出整体差异列表、还原度得分、优先级建议，保存到 `iterations/<iteration-no>/`
      * 若还原度得分 ≥ 99% 且无明显差异，跳至步骤 5
      * 若整页对比发现问题，将问题定位到具体 V-Zone，回退至 4.1 重新进入 V-Zone Loop
   4.3 每轮迭代记录：V-Zone 得分变化、整页得分、修复的 Bugs、新增问题
5. **最终验证**：对最终产物进行一次完整整页截图与视觉分析，确认还原度；同时抽检关键 V-Zone 的元素级截图
6. **输出报告**：将迭代过程、V-Zone 得分变化、最终得分、残留差异、下一步建议写入 `<working-dir>/docs/ui/<taskname>/reports/ui-ralph-report.md`，按 V-Zone 组织结果
7. 任务结束，清空 Tasks
