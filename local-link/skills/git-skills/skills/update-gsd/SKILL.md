---
name: update-gsd
description: Automatically update GSD codebase documentation when code changes are detected. Use this skill when working with GSD projects to keep .planning/codebase/*.md documentation synchronized with actual code changes. This skill monitors git operations (commit, rebase, cherry-pick) and triggers documentation updates after a 10-minute cooldown period.
disable-model-invocation: true
---

自动更新 GSD（Goal-Space-Direction）项目中的代码库文档。当检测到代码变更时，在冷却期后自动触发文档更新。

## 总体要求
每次上下文压缩后，重新读取该技能文件。

## 启动技能时
1. 计算文档hash
2. 不论 `$isOld` 创建定时器，计时 60±10 分钟
3. 每当项目有 git commit / git rebase / cherry-pick 等变更代码操作：
  3.1 重置定时器
  3.2 杀死可能的正在运行的子代理 `gsd-codebase-mapper` 

## 如何计算文档hash
1. 计算 `.planning/codebase/*.md` 总和的 hash，记为 `$doc_hash`
  1.1 当不存在任何文档，`$doc_hash` 应当记为空
  1.2 如果 `$doc_hash` 为空，报错退出，并使用 Ask 工具提醒用户是否执行 `/gsd:mapping-codebase` 技能生成文档
2. 对比 `.panning/meta.yaml` 的 `codebase` 的 `hash` 字段和 `$doc_hash` 是否一致，当文件缺失或不一致，记为 `$isOld`

## 当计时到期

如果 `$isOld`：
1. 创建子代理 `gsd-codebase-mapper` ，子代理工作步骤如下：
  1.1 读取 `.panning/meta.yaml` 的 `codebase` 的 `from` 字段，判断文档目前对齐哪一个提交，记为 `$from`
  1.2 所谓参考代码（以便更新文档），是指 `git diff <$from>...HEAD`，但如果 `$from` 为空，则不指定参考代码
  1.3 注意，参考代码不应文档更新，只包含代码、配置项等变更
  1.4 根据参考代码，使用中文，补充或修复 `.planning/codebase/*.md` 的内容，应当极端克制，无必要不更新
  1.5 向主代理汇报更新成功及附带极简概要
2. 重新计算文档 hash（以及 `$isOld`）
3. 更新 `.panning/meta.yaml` 的 `codebase` 的 `hash` 字段为 `HEAD` 的 short-hash
4. 重置定时器

如果 `$isOld` 为 false：
1. 删除定时器，因为文档已更新，且已经有一段时间没有代码变更
