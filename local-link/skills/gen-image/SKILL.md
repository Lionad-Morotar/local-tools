---
name: gen-image
description: 通常在 web-search 没有办法解决用户需求时，调用此技能，创造或生成全新图片。
disable-model-invocation: true
---

## workflow

1. 根据用户任务打磨提示词 $prompt
2. 使用 `/prompt-to-image` 技能的 `gemini-3-pro-image-preview` 模型，使用 $prompt 生成图片到技能默认存放目录
3. 不自动打开图片，除非用户任务中明确要求
4. 判断用户任务，对生成的内容备份，并调整（如压缩或裁剪）至合适
5. 汇报工作成果：图片路径、图片大小等元信息
