---
name: debug-by-commits
description: |
  通过 Git Commit 二分法调试前端白屏/卡死问题。
  当用户报告页面白屏、无响应、卡死，且怀疑是代码问题时使用。
  特别适用于：
  1. 开发服务器能启动但页面显示白屏
  2. 页面无响应或卡死（可能是死循环）
  3. 需要快速定位引入问题的具体 commit
  4. 需要排除缓存、配置等干扰因素
disable-model-invocation: true
---

# Debug by Commits

## 核心思想

当页面出现白屏或卡死时，通过 Git 回退到之前的 commit，逐个验证，快速定位问题引入点。

## 使用步骤

### 1. 保存当前工作

```bash
# 查看当前状态
git status --short
git log --oneline -10

# 保存当前工作（包括未跟踪文件）
git stash push -m "stash: debug 问题" --include-untracked
```

### 2. 确定检查范围

```bash
# 查看最近提交历史
git log --oneline -10
```

选择要回退的目标 commit（通常是已知正常的版本）。

### 3. 回退并清理

```bash
# 回退到指定 commit
git checkout <commit-hash>

# 清理依赖（关键！排除缓存干扰）
rm -rf node_modules .nuxt

# 杀掉残留进程
pkill -f "nuxt" || true
```

### 4. 安装依赖并测试

```bash
pnpm install && pnpm dev
```

让用户验证页面是否正常：
- **正常** → 问题在后面的 commit，继续向前检查
- **白屏/卡死** → 问题在这个 commit 或之前，继续往回检查

### 5. 二分定位

重复步骤 3-4，使用二分法快速缩小范围：

```
正常 ←——————————————————→ 白屏
      ↑
    检查中间点
```

### 6. 定位问题 commit

找到第一个出现问题的 commit 后：

```bash
# 查看该 commit 的具体改动
git show <commit-hash>

# 查看改动的文件列表
git show <commit-hash> --stat

# 查看具体改动内容
git show <commit-hash> --no-patch
```

### 7. 修复问题

根据改动内容分析可能的问题。重点检查该 commit 引入的新代码：

**分析思路：**
1. 查看改动的文件数量和类型
2. 关注新增的逻辑、hooks、组件
3. 检查是否有新的异步操作或副作用
4. 对比正常版本和问题版本的差异

**不要预设立场** - 白屏可能由多种原因导致，需要根据具体改动分析，而不是套用固定模式。

### 8. 恢复工作

修复完成后，恢复之前 stash 的工作：

```bash
# 回到原分支
git checkout <branch-name>

# 恢复 stash
git stash pop
```

## 关键注意事项

1. **必须清理依赖** - 每次切换 commit 后都要删除 `node_modules` 和 `.nuxt`，排除缓存干扰
2. **杀掉残留进程** - 确保旧的 dev server 完全停止
3. **不要依赖截图** - 白屏问题需要用户实际验证，不能只看 snapshot
4. **关注用户反馈** - 用户说"不是缓存问题"时要相信，专注于代码本身
5. **保持开放** - 问题可能出现在任何地方，不要过早下结论

## 反思模板

定位到问题后，记录：

```
问题 commit: <hash>
问题文件: <file-path>
问题类型: <死循环/异步/生命周期/响应式/其他>
根本原因: <具体解释>
修复方案: <如何修复>
```
