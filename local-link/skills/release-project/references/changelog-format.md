# Changelog 格式规范（Keep a Changelog）

整理 Changelog（技能第 3 步）时按需读取。遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

## 标准格式

````markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 新添加的功能

### Changed
- 对现有功能的变更

### Deprecated
- 已经不建议使用，即将移除的功能

### Removed
- 已经移除的功能

### Fixed
- 对 bug 的修复

### Security
- 对安全性的改进

## [1.0.0] - 2024-01-15

### Added
- 正式发布版本
````

## 变动类型说明

| 类型 | 说明 |
|-----|------|
| `Added` | 新添加的功能 |
| `Changed` | 对现有功能的变更 |
| `Deprecated` | 已经不建议使用，即将移除的功能 |
| `Removed` | 已经移除的功能 |
| `Fixed` | 对 bug 的修复 |
| `Security` | 对安全性的改进 |

## Unreleased 区块

在文档最上方维护 `## [Unreleased]` 区块：

- 记录即将发布的变更内容
- 发布新版本时，将内容移动至新版本区块
- 保持空区块（无内容时保留标题）

## YANKED 版本

对于因重大 bug 或安全原因撤下的版本：

```markdown
## [0.0.5] - 2014-12-13 [YANKED]
```
