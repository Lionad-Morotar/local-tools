---
name: recognize-codebase-branch-flow
description: 识别并记忆项目 git 分支模型
disable-model-invocation: true
---

将项目信息持久化到本地 SQLite 数据库，用于后续快速查询和分析。

## 数据库

- 路径：`./db/branches.sqlite3`
- 初始化标记：`./db/inited.lock`

## Workflow

### 1. 初始化（首次使用）

检查 `./db/inited.lock` 是否存在。不存在时：
- 创建 SQLite 数据库
- 执行建表语句：
  ```sql
  CREATE TABLE projects (
    path TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    branch_model TEXT NOT NULL,
    total_commits INTEGER NOT NULL DEFAULT 0,
    last_commit_date TEXT,
    last_commit_user TEXT,
    users TEXT DEFAULT '[]',
    analyzed_at TEXT NOT NULL,
    hash TEXT NOT NULL
  );
  ```
- 写入 `./db/inited.lock`

### 2. 检查缓存

对每个待分析项目（realpath 作为主键）：
- 查询 `analyzed_at` 字段
- 若距今 ≤7 天，直接跳过（SKIP），除非用户有强制覆盖意图
- 否则重新分析

### 3. 分析项目

收集以下 git 信息：
- `total_commits`: `git rev-list --count --all`
- `last_commit_date`: 最近提交日期
- `last_commit_user`: 最近提交者
- `users`: 全部提交者去重后的数组
- `hash`: 当前 HEAD 短哈希（7 位）

获取所有本地和远程分支（去重）：
```bash
git branch -a | sed 's/^[* ]*//' | sed 's|remotes/[^/]*/||' | sort -u
```

### 4. 分支模型判断（由你推理决定）

根据收集到的分支上下文，结合你对分支模型的理解，做出判断。

可选判定结果：gitflow、github flow、gitlab flow、无显著分支模型、自建模式

### 5. 写入数据库

使用 `INSERT OR REPLACE` 更新项目记录，字段：
`path`, `name`, `branch_model`, `total_commits`, `last_commit_date`, `last_commit_user`, `users`, `analyzed_at`, `hash`

## References

当你需要详细了解分支模型差异，或用户要求提供权威资料时，参考以下资源: 

* [Gitflow](https://git-flow.sh/workflows/gitflow/)
* [Github Flow](https://git-flow.sh/workflows/github-flow/)
* [Gitlab Flow](https://git-flow.sh/workflows/gitlab-flow/)
