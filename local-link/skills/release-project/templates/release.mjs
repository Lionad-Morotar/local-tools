#!/usr/bin/env node

/**
 * 多包（workspace）发布脚本模板 — pnpm release
 *
 * 复制自 release-project 技能 templates/release.mjs。使用方式:
 *   1. 按依赖序填写下方 PACKAGES（被依赖者先发）
 *   2. 根 package.json 增加: "release": "node scripts/release.mjs"
 *      （单包项目不需要本脚本，用三行 scripts 即可：prebuild/prerelease/release）
 *   3. 验证: pnpm release -- --dry-run
 *
 * 生命周期门禁链在根 package.json 配置，本脚本不重复:
 *   pnpm release → prerelease → pnpm build → prebuild → pnpm test
 *
 * 2FA/OTP 边界: npm 账号开 auth-and-writes 2FA 时，非交互发布会报
 * ERR_PNPM_OTP_NON_INTERACTIVE——多包 = 多个独立 publish 进程，每个都要一枚
 * OTP（30s 窗口）。正式发布请用 `! pnpm release` 交互执行（OTP 逐包提示），
 * 或配 bypass-2FA 的 granular access token 写入 ~/.npmrc；dry-run 不受影响。
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ─── 配置 ────────────────────────────────────────────────────

/** 按依赖序硬编码（被依赖者先发），路径相对仓库根目录 */
const PACKAGES = [
  // 'packages/core',
  // 'packages/vue',
  // 'packages/nuxt',
]

/**
 * 显式锁官方源：本地 .npmrc 可能指向镜像（npmmirror），发布必须打到 npmjs。
 * Why 用 --config.registry= 形式: pnpm 12 起 `publish --registry` flag 已移除，
 * `npm_config_registry` 环境变量也不再覆盖用户 .npmrc，CLI 参数是唯一可靠入口。
 */
const REGISTRY = 'https://registry.npmjs.org'

// ─── 参数 ────────────────────────────────────────────────────

// pnpm 会把 `--` 字面量原样透传给脚本，需过滤
const args = process.argv.slice(2).filter((a) => a !== '--')
const dryRun = args.includes('--dry-run')

if (PACKAGES.length === 0) {
  console.error('✗ PACKAGES 为空——按依赖序填写包目录（被依赖者先发）')
  process.exit(1)
}

// ─── 发布 ────────────────────────────────────────────────────

const root = process.cwd()

for (const dir of PACKAGES) {
  const pkgDir = join(root, dir)
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))

  // dist-tag 自动推导: prerelease 段（1.0.0-alpha.0）→ --tag alpha，防止顶掉 latest。
  // 注意 npm 平台行为: 首发时 registry 强制 latest 指向首版本，该防护只对已有 latest 的包生效。
  const channel = pkg.version.match(/-([a-z]+)/i)?.[1]
  const tagArgs = channel ? ['--tag', channel] : []

  const publishArgs = [
    'publish',
    `--config.registry=${REGISTRY}`,
    // 发版流程本身已保证工作区干净，pnpm 的 git-checks 额外要求（如必须在 main）易误伤
    '--no-git-checks',
    ...tagArgs,
    ...args,
  ]
  console.log(`\n▸ ${pkg.name}@${pkg.version} (tag: ${channel ?? 'latest'})${dryRun ? ' [dry-run]' : ''}`)

  try {
    // cwd 设为包目录后裸 `pnpm publish`: `pnpm publish <dir>` 后接 flag 有解析冲突。
    // 必须用 pnpm 而非 npm——只有 pnpm 会把 workspace:* 转成实体版本号（npm 原样打包，安装即炸）。
    // Windows 上 pnpm 是 .cmd，execFileSync 需要 shell 才能解析。
    execFileSync('pnpm', publishArgs, {
      cwd: pkgDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
  } catch {
    console.error(`\n✗ ${pkg.name} 发布失败，已中止。已发布的包不会回滚，修复后重跑即可。`)
    process.exit(1)
  }
}

console.log(`\n✓ ${dryRun ? 'dry-run 通过' : '全部发布完成'}（${PACKAGES.length} 个包）`)
