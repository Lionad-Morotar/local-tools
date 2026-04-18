---
name: recognize-codebase-branch-flow
description: 识别并记忆项目 git 分支模型
disable-model-invocation: true
---

## context

* $isInited: `exists ./db/inited.lock`
* $project: 从用户输入或上下文判断待分析的 git 项目
* $cacheTime: 缓存超时时间，默认为一周

## workflow

1. 根据是否已经初始化 $isInited 初始化或获取数据: 
  1.1 获取项目数据，如果分析时间距今超过 $cacheTime，则重新分析项目
  1.2 初始化，在 [db](./db/) 目录下初始化 sqlite 数据库，并创建文件占位 `./db/inited.lock`
2. 分析项目:
  2.1 分支模型: gitflow、github flow、gitlab flow、自建模式、无显著分支模型
  2.2 分析时分支所在短哈希: $hash
3. 将项目信息更新数据库: 项目路径（realpath，作为主键）、项目名、分支模型、总提交数、最后提交日期、最后提交用户、用户数组、分析时间、$hash
4. 组装返回结果

## References

当你需要详细了解分支模型差异，或用户要求提供权威资料时，参考以下资源: 

* [Gitflow](https://git-flow.sh/workflows/gitflow/)
* [Github Flow](https://git-flow.sh/workflows/github-flow/)
* [Gitlab Flow](https://git-flow.sh/workflows/gitlab-flow/)