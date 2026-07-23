# VSCode 扩展发布（vsce）

SKILL.md「发布脚本约定」的 VSCode 扩展分支：当 preflight `发布目标 = vscode-extension`（package.json 含 `engines.vscode`）时走本文档，而非 npm 发布路径。VSCode 扩展用 `@vscode/vsce` 打包/发布，**不上 npm registry**——所有 npm 中心化的检查（registry 首发判定、dist-tag、`npm publish --dry-run`）都不适用。

## 发布形态

| 形态 | 命令 | 产物/效果 | 适用 |
|------|------|----------|------|
| 本地分发 | `vsce package` | `<name>-<version>.vsix`，`code --install-extension` 安装 | 个人/小范围自用 |
| Marketplace 上架 | `vsce publish` | 推送到 VSCode Marketplace，需 publisher PAT | 公开分发 |

两种形态共享同一套门禁链与打包配置，仅末步命令不同。

## release 脚本门禁链

```json
{
  "scripts": {
    "build": "tsc -p ./",
    "compile": "tsc -p ./",
    "prebuild": "pnpm test",
    "prerelease": "pnpm run build",
    "vscode:prepublish": "tsc -p ./",
    "release": "pnpm exec vsce package"
  }
}
```

链路：`pnpm release` → `prerelease`(build) → `prebuild`(test) → `build`(tsc) → `vsce package` → `vscode:prepublish`(tsc 直调)。

**关键非显而易见点——`vscode:prepublish` 必须直调 `tsc -p ./`，不能写 `pnpm run build`**：

- `vscode:prepublish` 是 vsce 在 package/publish 前自动触发的钩子（区别于 npm 的 `prepublishOnly`）
- 若写 `pnpm run build`，会经 `prebuild` 再跑一遍全量 test（`prerelease` 链已覆盖，重复跑纯浪费）
- 直调 `tsc -p ./` 绕过 npm script 生命周期，只编译不测试

`build` 与 `compile` 都是 `tsc -p ./`：`build` 是为对齐 preflight 门禁链命名检查（prerelease 需含 `build`、prebuild 需含 `test`），`compile` 保留是为兼容 README 与既有脚本引用。VSCode 扩展的"构建"就是 tsc 产出 `out/`。

末步 `release`：

- 本地分发用 `pnpm exec vsce package`
- Marketplace 上架用 `pnpm exec vsce publish`（需先 `vsce login <publisher>` 或设 `VSCE_PAT` 环境变量）

## .vscodeignore 卫生

vsce 默认打包除 `.gitignore` + `.vscodeignore` 之外的所有文件。`.vscodeignore` 必须收紧，否则 vsix 会塞进 `src/`/`test/`/`docs/`/`node_modules/`：

```
.vscode/**
.vscode-test/**
src/**
test/**
out/test/**
docs/**
node_modules/**
.gitignore
.gitattributes
tsconfig*.json
vitest.config.ts
**/*.map
*.vsix
pnpm-lock.yaml
```

保留：`out/`（编译产物）、`examples/`（辅助脚本，若 README 引用）、`README.md`（vsce 强制）、`LICENSE`、`CHANGELOG.md`。打包后用 `vsce package` 输出的文件清单核对（见下）。

## 首发判定与 dry-run（与 npm 的差异）

**首发判定**：不用 `npm view`（扩展不上 npm）。用 git tag 历史——无 `v*` tag 即首发。preflight 已据此实现（`发布目标 = vscode-extension` 时输出"首发判定"而非"npm registry"）。

**dry-run**：`vsce package` **没有** `--dry-run` 选项（区别于 `npm publish --dry-run`）。门禁链健康由 `prerelease → build → prebuild → test` 本身证明；打包正确性靠 `vsce package` 实际执行后输出的 "Files included in the VSIX" 清单核对——对照 `.vscodeignore` 确认无源码/测试/配置泄漏。

注意：`pnpm release -- --dry-run` 对 vsce 无效——pnpm 透传会产生双 `--`，vsce 把 `--dry-run` 当成 version 位置参数报 `Invalid version --dry-run`。不要尝试。

## 首次发布准备（区别于 npm first-publish）

VSCode 扩展首发的 package.json 必备字段与 npm 不同：

```jsonc
{
  "name": "ext-name",            // 不含 publisher 前缀
  "publisher": "your-publisher", // Marketplace 发布者 ID
  "version": "0.1.0",
  "engines": { "vscode": "^1.75.0" },
  "main": "./out/extension.js",
  "contributes": { /* commands / configuration / ... */ },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "license": "MIT",
  "repository": { "type": "git", "url": "..." }
}
```

额外检查清单：

- [ ] `publisher` 已在 Marketplace 注册（https://marketplace.visualstudio.com/manage）
- [ ] `README.md` 存在（vsce 强制，否则 package 失败）
- [ ] `LICENSE` 存在
- [ ] `.vscodeignore` 已收紧
- [ ] Marketplace 上架：已通过 `vsce login <publisher>` 或 `VSCE_PAT` 环境变量配置 PAT（Azure DevOps Personal Access Token，**非 npm token**）
- [ ] 本地分发：`pnpm release` 生成 vsix 后，`code --install-extension <name>-<version>.vsix` 验证安装
