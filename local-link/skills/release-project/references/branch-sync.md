# Branch-sync 模式（`--sync-to <target-branch>`）

传入 `--sync-to release` 时，**仅执行分支同步**，跳过版本规划、Changelog 整理、版本号升级、Git 标签创建和 npm 发布。用于把当前分支（如 `dev`）的最新内容同步到目标分支（如 `release`），以便 Jenkins 等 CI/CD 触发运行。

该模式下：

- 不升级版本号、不打 tag、不写 Changelog
- 先 `git fetch` 确保判断准确
- 检测当前分支与目标分支的相对位置，自动选择 **fast-forward** 或 **non-fast-forward merge**
- 同步完成后切回源分支
- 如果目标分支不存在，询问是否基于当前分支创建

`--sync-to` 与 `--changelog-only` 不能同时使用。若同时传入，向用户确认以哪个为准，或默认 `--sync-to` 优先并报告冲突。

## 执行流程

1. **记录源分支**：
   ```bash
   SOURCE=$(git branch --show-current)
   TARGET=<用户传入的目标分支>
   ```

2. **拉取远端最新状态**：
   ```bash
   git fetch origin
   ```

3. **检查目标分支是否存在**：
   - 本地：`git branch --list "$TARGET"`
   - 远端：`git ls-remote --heads origin "$TARGET"`
   - 都不存在：询问用户是否创建；若确认，执行 `git checkout -b "$TARGET"`

4. **确保远端 tracking 存在**：
   - 若本地有目标分支但没有 tracking：`git branch -u origin/"$TARGET" "$TARGET"`
   - 若只有远端有目标分支：`git checkout -t origin/"$TARGET"`

5. **计算相对位置**：
   ```bash
   AHEAD=$(git rev-list --count "$TARGET".."$SOURCE")
   BEHIND=$(git rev-list --count "$SOURCE".."$TARGET")
   ```

6. **根据相对位置执行同步**：

   | 状态 | 决策 |
   |-----|------|
   | `AHEAD > 0 && BEHIND == 0` | 当前分支领先，执行 fast-forward（见下） |
   | `AHEAD == 0 && BEHIND > 0` | 目标分支已领先，无需同步，直接结束 |
   | `AHEAD == 0 && BEHIND == 0` | 两分支已一致，无需同步，直接结束 |
   | `AHEAD > 0 && BEHIND > 0` | 两分支分叉，执行 non-fast-forward（见下） |

7. **切回源分支**：
   ```bash
   git checkout "$SOURCE"
   ```

## fast-forward 同步

```bash
git checkout "$TARGET"
git merge "$SOURCE" --ff-only
git push origin "$TARGET"
```

## non-fast-forward 同步

分叉时按项目 merge style 选择：

- **trunk-based 项目**（如 github flow，主分支为发布分支）：`git merge "$SOURCE" --no-ff -m "chore: sync $SOURCE into $TARGET"`，随后 `git push origin "$TARGET"`
- **持续在 dev/release 分支集成的项目**：优先使用 fast-forward；若无法 ff，询问用户是 `--no-ff` merge 还是先把源分支 rebase 到目标分支后再同步

## 通用保护

1. 同步前检查工作区是否干净；不干净则拒绝或让用户先提交
2. 同步前确保源分支已 `git push origin <source-branch>`
3. 同步后切回源分支
4. push 失败时（如目标分支受保护）立即报告，不继续后续发版流程
