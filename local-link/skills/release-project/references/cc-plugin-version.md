# Claude Code 插件版本号同步

Claude Code 插件的版本号通常分散在多个配置与文档中，发布时如果只更新一处，会导致插件加载器、Marketplace、CLI 与文档之间出现版本不一致。

## 需要同步的常见来源

- package.json
- plugin/.claude-plugin/plugin.json
- .claude-plugin/marketplace.json
- 文档中引用的版本示例

## 发布流程

1. 在变更完成后确定版本类型（patch / minor / major）。
2. 检索仓库内所有当前版本的引用位置。
3. 将所有引用统一更新为目标版本号。
4. 检查是否仍有遗漏的旧版本字符串。
5. 更新 CHANGELOG 后，与版本号改动一起提交、打 tag 并推送。

## 注意事项

- 不要依赖单一的 npm version 命令完成全部同步，它通常只修改 package.json。
- Marketplace 与插件元数据中的 version 字段是 Claude Code 识别插件版本的实际依据。
- 文档中的版本示例若与真实版本脱节，会让安装者产生困惑。
- 首次发布前，确认 author、license、repository 等元数据已经完整。
