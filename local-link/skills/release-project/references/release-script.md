# 发布脚本细节（pnpm release）

SKILL.md「发布脚本约定」的扩展细节：生命周期门禁链与单包配置见 SKILL.md，本文档覆盖多包项目发布脚本与可选的自动化脚本。

## 多包（workspace）项目

用 Node 脚本按**依赖序**发布（被依赖者先发），`scripts/release.mjs` 要点：

1. 包顺序硬编码依赖序（如主库 → 框架绑定 → 元框架模块）
2. **dist-tag 自动推导**：版本含 prerelease 段（`1.0.0-alpha.0`）时自动 `--tag alpha`；stable 不带 tag（即 latest）。避免 alpha 顶掉 latest 的事故
3. **registry 显式锁官方源**：本地 npm 配置可能指向镜像（npmmirror），发布必须打到 npmjs。pnpm 12 起 `publish --registry` flag 已移除、`npm_config_registry` 环境变量不再覆盖用户 `.npmrc`——可靠的锁定方式是 CLI 参数 `--config.registry=https://registry.npmjs.org`；且 `pnpm publish <dir>` 后接 flag 有解析冲突，应把 `cwd` 设为包目录后裸 `pnpm publish`
4. **必须用 `pnpm publish`**：只有 pnpm 会把 `workspace:*` 转成实体版本号，npm publish 会原样打包该协议（安装即炸）
5. 参数透传（`pnpm release -- --dry-run`），并过滤 pnpm 原样传入的字面量 `--`
6. 任一包失败即中止并提示"已发布的包不会回滚，修复后重跑即可"
7. **2FA/OTP 交互边界**：npm 账号开 auth-and-writes 2FA 时，非交互发布报 `ERR_PNPM_OTP_NON_INTERACTIVE`。多包 = 多个独立 publish 进程，每个都要一枚 OTP（30s 窗口），代理无法代办——正式发布请用户用 `! pnpm release` 交互执行（OTP 提示逐包出现，dry-run 不受影响可照常跑），或配 bypass-2FA 的 granular access token 写入 `~/.npmrc`
8. **npm 首发 latest 平台行为**：新包第一次发布时 registry 强制把 `latest` 指向首版本，即使 `--tag alpha`——dist-tag 防护只对已有 latest 的包生效。首发 alpha 暂占 latest 不是脚本 bug，stable 发布后自动移交

## 代码模板（templates/release.mjs）

技能自带可直接复制的多包发布脚本模板 [templates/release.mjs](../templates/release.mjs)，覆盖上述全部要点（依赖序、dist-tag 推导、registry 锁定、`pnpm publish`、参数透传、失败中止、OTP 提示）。

使用方式：

1. 复制到目标项目 `scripts/release.mjs`，按依赖序填写 `PACKAGES`
2. 根 package.json 增加 `"release": "node scripts/release.mjs"`（单包项目不需要本脚本，用 SKILL.md「发布脚本约定」的三行 scripts 即可）
3. 跑通 `pnpm release -- --dry-run` 验证（见 SKILL.md「Dry-run 验证」）
