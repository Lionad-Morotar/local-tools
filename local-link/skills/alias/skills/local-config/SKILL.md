---
name: local-config
description: 修改我的本地应用配置
disable-model-invocation: true
---

## Context

* 项目配置文件：`~/Library/Application Support/Code - Insiders/User/globalStorage/alefragnani.project-manager/projects.json`
* FavFile配置文件：`~/Library/Application Support/Code - Insiders/User/globalStorage/fredjeck.fav/favorites.json`

## Workflow

1. 从上下文提取任务类型
2. 在 Context 涉及的配置文件内，对内容进行增删改查，以便完成任务
3. 当任务范畴覆盖或超出项目配置文件本身，应当报错“我只被允许修改xxx”
