#!/usr/bin/env node

/**
 * release-project 技能的发版机械检查（preflight / postflight）
 *
 * Why: 发版检查清单中可机械判定的项（工作区、远程同步、CHANGELOG 结构、
 * release 脚本链、registry 状态、tag 冲突）交给脚本一次跑完——比 agent 逐条
 * 执行 git/npm 命令快一个数量级，且不消耗上下文 token。agent 只需处理 fail 项，
 * info 项（分支/tag/registry 状态）直接作为分支模型判定（技能第 1.1 步）的输入。
 *
 * 用法:
 *   node preflight.mjs            发版前检查（默认）
 *   node preflight.mjs --post     发布后校验
 *   node preflight.mjs --json     JSON 输出（供自动化流程消费）
 *   node preflight.mjs --cwd DIR  指定项目目录（默认当前目录）
 *
 * 退出码: 存在 fail 项时为 1，否则为 0（warn / info 不阻断）。
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const isPost = argv.includes('--post')
const asJson = argv.includes('--json')
const cwdFlag = argv.indexOf('--cwd')
const cwd = cwdFlag !== -1 ? argv[cwdFlag + 1] : process.cwd()

const NPM_REGISTRY = 'https://registry.npmjs.org'
const results = []

/** registry URL 归一化：去尾部斜杠、http 升 https，使不同写法的同源地址可比较 */
function normalizeRegistry(url) {
  if (!url) return null
  return url.trim().replace(/\/+$/, '').replace(/^http:/, 'https:')
}
function isOfficialRegistry(url) {
  return normalizeRegistry(url) === NPM_REGISTRY
}

function report(name, status, detail = '') {
  results.push({ name, status, detail })
}

/**
 * 执行 shell 命令并捕获结果。发版检查里命令失败本身就是信号（如 npm view 404
 * 表示首发），所以失败不抛出，由调用方根据 ok / err 判读。
 */
function run(cmd, timeout = 10_000) {
  try {
    const out = execSync(cmd, {
      cwd,
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return { ok: true, out, err: '' }
  } catch (e) {
    return { ok: false, out: '', err: String(e.stderr ?? e.message) }
  }
}

// ─── 发版前检查 ──────────────────────────────────────────────

function checkGitRepo() {
  const r = run('git rev-parse --is-inside-work-tree')
  if (!r.ok || r.out !== 'true') {
    report('git 仓库', 'fail', '当前目录不是 git 仓库，后续检查终止')
    return false
  }
  return true
}

function checkWorktree() {
  const r = run('git status --porcelain')
  if (r.ok && !r.out) {
    report('工作区', 'pass', '干净，无未提交变更')
  } else {
    report('工作区', 'fail', `存在未提交变更:\n${r.out || r.err}`)
  }
}

function checkBranchSync() {
  const branch = run('git branch --show-current')
  if (!branch.ok || !branch.out) {
    report('当前分支', 'fail', 'detached HEAD，不在任何分支上')
    return
  }
  report('当前分支', 'info', branch.out)

  // fetch 失败（离线/无远程）不阻断，降级后基于本地 upstream 引用判断
  const fetched = run('git fetch origin --quiet', 20_000).ok
  const upstream = run('git rev-parse --abbrev-ref @{u}')
  if (!upstream.ok || !upstream.out) {
    report('远程同步', 'warn', `${branch.out} 无 upstream（未推送或无远程分支）`)
    return
  }
  const ahead = Number(run(`git rev-list --count @{u}..HEAD`).out || 0)
  const behind = Number(run(`git rev-list --count HEAD..@{u}`).out || 0)
  if (ahead > 0) {
    report('远程同步', 'fail', `领先 ${upstream.out} ${ahead} 个提交未推送`)
  } else if (behind > 0) {
    report('远程同步', 'warn', `落后 ${upstream.out} ${behind} 个提交，先 git pull --ff-only`)
  } else {
    report('远程同步', 'pass', `与 ${upstream.out} 一致${fetched ? '' : '（fetch 失败，基于本地引用）'}`)
  }
}

/** 长期分支与最新 tag 位置探测，输出为分支模型判定（技能第 1.1 步）的直接输入 */
function probeBranchModel() {
  const branches = run(`git branch -a --list '*release*' '*develop*' 'test'`)
  const branchList = branches.ok && branches.out ? branches.out.replace(/\s+/g, ' ').trim() : ''
  report('长期分支', 'info', branchList || '无 release / develop / test 分支')

  const tag = run(`git tag -l 'v*' --sort=-v:refname | head -1`)
  if (!tag.ok || !tag.out) {
    report('最新 tag', 'info', '无 v* 标签（疑似首发）')
    return
  }
  const containers = run(`git branch --contains ${tag.out}`)
  const where = containers.ok && containers.out ? containers.out.replace(/\s+/g, ' ').trim() : '（不在任何本地分支）'
  report('最新 tag', 'info', `${tag.out} 位于: ${where}`)
}

/** 返回最新已发布段的版本号（无则 null），供版本一致性比对 */
function checkChangelog() {
  const file = join(cwd, 'CHANGELOG.md')
  if (!existsSync(file)) {
    report('CHANGELOG', 'fail', 'CHANGELOG.md 不存在')
    return null
  }
  const content = readFileSync(file, 'utf8')
  if (/^## \[Unreleased\]/m.test(content)) {
    report('CHANGELOG [Unreleased]', 'pass', '区块存在')
  } else {
    report('CHANGELOG [Unreleased]', 'fail', '缺少 ## [Unreleased] 区块')
  }

  const m = content.match(/^## \[(.+?)\] - (\S+)/m)
  if (!m) {
    report('CHANGELOG 版本段', 'info', '尚无已发布版本段（首发）')
    return null
  }
  const [, version, date] = m
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    report('CHANGELOG 日期', 'pass', `[${version}] - ${date}`)
  } else {
    report('CHANGELOG 日期', 'fail', `[${version}] 的日期 "${date}" 非 ISO 8601（YYYY-MM-DD）`)
  }
  return version
}

function readPackage() {
  const file = join(cwd, 'package.json')
  if (!existsSync(file)) {
    report('package.json', 'info', '不存在（非 Node 项目），跳过包相关检查')
    return null
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    report('package.json', 'fail', 'JSON 解析失败')
    return null
  }
}

function checkReleaseScripts(pkg, target) {
  if (target === 'claude-skill') {
    report('release 脚本', 'pass', 'skill 包（SKILL.md）不通过 npm 发布，无需 release 脚本')
    return
  }
  const s = pkg.scripts ?? {}
  if (s.release) {
    report('release 脚本', 'pass', s.release)
  } else {
    report('release 脚本', 'fail', '缺少 scripts.release（约定见技能「发布脚本约定」）')
  }
  // 钩子链缺失为 warn 而非 fail——老项目可能尚未补齐约定，不阻断发版
  if (!s.prerelease) {
    report('prerelease → build', 'warn', '缺失（约定：prerelease 自动 build）')
  } else if (/build/.test(s.prerelease)) {
    report('prerelease → build', 'pass', s.prerelease)
  } else {
    report('prerelease → build', 'warn', `prerelease 未含 build: ${s.prerelease}`)
  }
  if (!s.prebuild) {
    report('prebuild → test', 'warn', '缺失（约定：prebuild 自动 test）')
  } else if (/test/.test(s.prebuild)) {
    report('prebuild → test', 'pass', s.prebuild)
  } else {
    report('prebuild → test', 'warn', `prebuild 未含 test: ${s.prebuild}`)
  }
}

function checkVersionConsistency(pkg, changelogVersion, target) {
  if (!pkg.version) return
  const tagCandidates = target === 'claude-skill' && pkg.name
    ? [pkg.name.startsWith('@') ? `${pkg.name}@${pkg.version}` : `v${pkg.version}`]
    : [`v${pkg.version}`]
  const existing = tagCandidates.find((t) => run(`git tag -l ${t}`).out === t)
  if (existing) {
    report('版本 tag', 'fail', `${existing} 已存在，禁止重复发版，先升级版本号`)
  } else {
    report('版本 tag', 'pass', `${tagCandidates.join(' / ')} 未被占用`)
  }
  if (changelogVersion && changelogVersion !== pkg.version) {
    report(
      '版本一致性',
      'warn',
      `package.json (${pkg.version}) 与 CHANGELOG 最新段 (${changelogVersion}) 不一致；若处于版本号升级前属正常`,
    )
  }
}

/**
 * 发布目标识别：读 package.json 静态字段判定分发渠道，决定 registry 检查与首发判定方式。
 * Why: 技能历史上默认"项目=npm 包"，但项目可能是 VSCode 扩展（vsce）、CLI 等非 npm 渠道。
 * 对这些项目跑 npm registry 检查会产出"404=首发""registry 版本 fail"等假信号——
 * 必须先识别发布目标，再据此分流检查项，避免 agent 人工过滤噪音。
 * 只读静态字段（不引入网络/工具调用），保持 preflight 毫秒级纯本地。
 */
function detectPublishTarget(pkg) {
  if (isSkillPackage(pkg)) return 'claude-skill'
  if (pkg.engines?.vscode) return 'vscode-extension'
  if (pkg.bin) return 'cli'
  return 'npm-package'
}

/**
 * 识别 Claude Code skill 包：入口为 SKILL.md，通过 `npx skills add owner/repo` 安装，
 * 不通过 npm registry 分发，因此跳过 registry / publishConfig / release 脚本等 npm 专属检查。
 */
function isSkillPackage(pkg) {
  if (!pkg) return false
  if (pkg.main === 'SKILL.md' || pkg.name?.endsWith('-skill')) return true
  const files = Array.isArray(pkg.files) ? pkg.files : []
  if (files.some((f) => f === 'SKILL.md' || f.endsWith('/SKILL.md'))) return true
  return false
}

/**
 * registry / 首发判定，按发布目标分流。
 * - vscode-extension：不上 npm registry，首发判定改用 git tag 历史（无 v* tag = 首发）
 * - npm-package / cli：npm view 查询，404 = 首发；显式锁官方源避免镜像同步延迟假阴性
 */
function checkRegistry(pkg, target, label = '') {
  const suffix = label ? ` (${label})` : ''
  if (pkg.private) {
    // monorepo 遍历时 private 包静默跳过，避免噪音；单包模式保留提示
    if (!label) report('npm registry', 'info', 'private 包，跳过')
    return
  }
  if (target === 'claude-skill') {
    report(`npm registry${suffix}`, 'info', `${pkg.name} 为 skill 包（SKILL.md），不通过 npm registry 分发，跳过`)
    return
  }
  if (target === 'vscode-extension') {
    const tag = run(`git tag -l 'v*' --sort=-v:refname | head -1`)
    if (!tag.ok || !tag.out) {
      report(`首发判定${suffix}`, 'info', 'VSCode 扩展（vsce），无 v* tag = 首发')
    } else {
      report(`首发判定${suffix}`, 'info', `VSCode 扩展（vsce），最新 tag = ${tag.out}`)
    }
    return
  }
  const r = run(`npm view ${pkg.name} version --registry ${NPM_REGISTRY}`, 15_000)
  if (r.ok && r.out) {
    report(`npm registry${suffix}`, 'info', `${pkg.name} 已发布，latest = ${r.out}`)
  } else if (/E404|404/.test(r.err)) {
    report(`npm registry${suffix}`, 'info', `${pkg.name} 查无此包（404）= npm 首发，走「6. 首次发布检测」`)
  } else {
    report(`npm registry${suffix}`, 'warn', `${pkg.name} 查询失败（网络/认证），无法判定首发状态: ${r.err.slice(0, 120)}`)
  }
}

/**
 * 展开所有实际发布目标：单包项目即根包；monorepo 展开 workspace 子包。
 * Why: preflight 历史上只查根 package.json，而 monorepo 根包通常 private，
 * 导致 registry 凭证、首发判定等检查被整体跳过——真正发布的是子包，
 * 全局 registry 为镜像且子包缺 publishConfig 的问题要到 publish 时才以
 * ENEEDAUTH 爆出来（读查询在镜像上成功，给出"一切正常"的假信号）。
 */
function enumeratePackages(rootPkg) {
  const patterns = readWorkspacePatterns(rootPkg)
  if (!patterns.length) {
    return [{ pkg: rootPkg, dir: cwd, label: rootPkg.name ?? 'root' }]
  }
  const dirs = []
  for (const pattern of patterns) {
    // 只支持 'dir' 与 'dir/*' 两种形式（覆盖绝大多数 workspace 配置），不引入 glob 依赖
    const m = pattern.match(/^(.+?)\/\*$/)
    if (m) {
      const base = join(cwd, m[1])
      if (!existsSync(base)) continue
      for (const entry of readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const dir = join(base, entry.name)
        if (existsSync(join(dir, 'package.json'))) dirs.push(dir)
      }
    } else {
      const dir = join(cwd, pattern)
      if (existsSync(join(dir, 'package.json'))) dirs.push(dir)
    }
  }
  const packages = []
  for (const dir of dirs) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      packages.push({ pkg, dir, label: pkg.name ?? dir })
    } catch {
      report('workspace 包', 'fail', `${dir}/package.json 解析失败`)
    }
  }
  if (!packages.length) report('workspace', 'warn', '声明了 workspace 但未展开到任何包')
  return packages
}

/** 读取 workspace 声明：package.json workspaces 字段优先，其次 pnpm-workspace.yaml（轻量解析，不引入 yaml 依赖） */
function readWorkspacePatterns(rootPkg) {
  if (Array.isArray(rootPkg.workspaces)) return rootPkg.workspaces
  if (Array.isArray(rootPkg.workspaces?.packages)) return rootPkg.workspaces.packages
  const file = join(cwd, 'pnpm-workspace.yaml')
  if (!existsSync(file)) return []
  const patterns = []
  let inPackages = false
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (/^packages:/.test(line)) {
      inPackages = true
      continue
    }
    if (!inPackages) continue
    const m = line.match(/^\s+-\s*['"]?([^'"\s]+)['"]?\s*$/)
    if (m) patterns.push(m[1])
    else if (/^\S/.test(line)) break // 遇到下一个顶层 key，packages 块结束
  }
  return patterns
}

/**
 * 逐包校验有效发布 registry 是否符合预期。
 * 有效发布 registry 优先级：publishConfig.registry > @scope:registry（npmrc）> 全局 registry——
 * npm / pnpm / changeset publish 都按此优先级解析发布目标。
 * Why: 镜像源（npmmirror 等）是只读的，全局 registry 配成镜像本意是加速 install，
 * 但若包未声明 publishConfig.registry，publish 会跟随全局配置发往镜像，
 * 以 ENEEDAUTH 或 405 爆出来。声明了 publishConfig 或 scope registry 视为显式意图，放行。
 */
function checkPublishRegistries(packages, isMonorepo) {
  const publishable = packages.filter(({ pkg }) => !pkg.private && pkg.name && !isSkillPackage(pkg))
  if (!publishable.length) return
  const globalRegistry = normalizeRegistry(run('npm config get registry').out)
  const scopeCache = new Map()
  const scopeRegistry = (name) => {
    const scope = name.startsWith('@') ? name.split('/')[0] : null
    if (!scope) return null
    if (!scopeCache.has(scope)) {
      const out = run('npm config get ' + scope + ':registry').out
      scopeCache.set(scope, out && out !== 'undefined' ? normalizeRegistry(out) : null)
    }
    return scopeCache.get(scope)
  }

  for (const { pkg } of publishable) {
    const label = isMonorepo ? ` (${pkg.name})` : ''
    const declared = normalizeRegistry(pkg.publishConfig?.registry)
    const scoped = scopeRegistry(pkg.name)

    if (declared && isOfficialRegistry(declared)) {
      report(`publish registry${label}`, 'pass', 'publishConfig → 官方源')
    } else if (declared) {
      report(`publish registry${label}`, 'info', `publishConfig → ${declared}（私有源，确认已登录该源）`)
    } else if (scoped) {
      report(`publish registry${label}`, 'info', `npmrc ${pkg.name.split('/')[0]}:registry → ${scoped}（确认已登录该源）`)
    } else if (isOfficialRegistry(globalRegistry)) {
      report(`publish registry${label}`, 'pass', '默认 registry 即官方源')
    } else {
      report(
        `publish registry${label}`,
        'fail',
        `${pkg.name} 无 publishConfig.registry，发布目标将跟随全局 registry = ${globalRegistry}（镜像/私有源通常只读，publish 会 ENEEDAUTH 或发到错误源）。` +
          '修复：package.json 添加 "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" }',
      )
    }

    // scoped 包默认 private 发布；publish 工具链（changeset config.access / npmrc access=public）有全局配置时可忽略
    if (pkg.name.startsWith('@') && pkg.publishConfig?.access !== 'public') {
      report(`publish access${label}`, 'warn', 'scoped 包未在 publishConfig 声明 access: public（若发布工具链无全局 access 配置，会默认发布为 private）')
    }
  }
}

// ─── 发布后校验 ──────────────────────────────────────────────

function checkPostTag(pkg, target) {
  const tagCandidates = target === 'claude-skill' && pkg.name
    ? [pkg.name.startsWith('@') ? `${pkg.name}@${pkg.version}` : `v${pkg.version}`]
    : [`v${pkg.version}`]
  const local = tagCandidates.find((t) => run(`git tag -l ${t}`).out === t)
  if (local) {
    report('git tag', 'pass', `${local} 已创建`)
  } else {
    report('git tag', 'fail', `${tagCandidates.join(' / ')} 不存在，发版未完成`)
  }
  const remoteTags = run(`git ls-remote --tags origin ${tagCandidates.join(' ')}`, 20_000).out
  const remote = tagCandidates.find((t) => remoteTags.includes(t))
  if (remote) {
    report('远程 tag', 'pass', `${remote} 已推送`)
  } else {
    report('远程 tag', 'warn', `${tagCandidates.join(' / ')} 未在远程，确认是否已 push --tags`)
  }
}

function checkPostRegistry(pkg, target, label = '') {
  const suffix = label ? ` (${label})` : ''
  if (pkg.private) return
  if (target === 'claude-skill') {
    report(`registry 版本${suffix}`, 'pass', `${pkg.name} 为 skill 包，不校验 npm registry，推送到 GitHub 即完成分发`)
    return
  }
  if (target === 'vscode-extension') {
    // VSCode 扩展不上 npm，--post 改校验 vsix 产物（vsce package 生成 <name>-<version>.vsix）
    const vsix = `${pkg.name}-${pkg.version}.vsix`
    if (existsSync(join(cwd, vsix))) {
      report(`vsix 产物${suffix}`, 'pass', `${vsix} 已生成`)
    } else {
      report(`vsix 产物${suffix}`, 'fail', `${vsix} 未找到，确认已跑 pnpm release / vsce package`)
    }
    return
  }
  const v = run(`npm view ${pkg.name}@${pkg.version} version --registry ${NPM_REGISTRY}`, 15_000)
  if (v.ok && v.out === pkg.version) {
    report(`registry 版本${suffix}`, 'pass', `${pkg.name}@${pkg.version} 可查`)
  } else {
    report(`registry 版本${suffix}`, 'fail', `官方源查不到 ${pkg.name}@${pkg.version}（刚发布可能有秒级延迟，稍后重试）`)
  }

  const tags = run(`npm view ${pkg.name} dist-tags --json --registry ${NPM_REGISTRY}`, 15_000)
  if (tags.ok && tags.out) {
    report(`dist-tags${suffix}`, 'info', tags.out.replace(/\s+/g, ' ').trim())
  }

  // workspace:* 残留会让安装方直接失败，必须拦截
  const deps = run(`npm view ${pkg.name}@${pkg.version} dependencies --json --registry ${NPM_REGISTRY}`, 15_000)
  if (deps.ok && /workspace:/.test(deps.out)) {
    report(`workspace 协议${suffix}`, 'fail', '已发布包的 dependencies 仍含 workspace:*，应使用 pnpm publish')
  } else if (deps.ok) {
    report(`workspace 协议${suffix}`, 'pass', 'dependencies 无 workspace:* 残留')
  }
}

// ─── 主流程 ──────────────────────────────────────────────────

if (checkGitRepo()) {
  const rootPkg = readPackage()
  const rootTarget = rootPkg ? detectPublishTarget(rootPkg) : null
  // monorepo 展开 workspace 子包——真正的发布目标是这些包，而非（通常 private 的）根包
  const packages = rootPkg ? enumeratePackages(rootPkg) : []
  const isMonorepo = rootPkg && !(packages.length === 1 && packages[0].dir === cwd)

  if (rootPkg) {
    if (isMonorepo) {
      report('workspace', 'info', `${packages.length} 个包：${packages.map(({ label }) => label).join(', ')}`)
    } else {
      report('包', 'info', `${rootPkg.name ?? '(unnamed)'}@${rootPkg.version ?? '?'}${rootPkg.private ? ' (private)' : ''}`)
    }
    report('发布目标', 'info', rootTarget)
  }

  if (isPost) {
    if (rootPkg?.version) checkPostTag(rootPkg, rootTarget)
    for (const { pkg, label } of packages) checkPostRegistry(pkg, detectPublishTarget(pkg), isMonorepo ? label : '')
  } else {
    checkWorktree()
    checkBranchSync()
    probeBranchModel()
    const changelogVersion = checkChangelog()
    if (rootPkg) {
      checkReleaseScripts(rootPkg, rootTarget)
      // 版本 tag 占用以整次发布为准（monorepo 共用一个 release tag），只看根版本
      checkVersionConsistency(rootPkg, changelogVersion, rootTarget)
      for (const { pkg, label } of packages) checkRegistry(pkg, detectPublishTarget(pkg), isMonorepo ? label : '')
      checkPublishRegistries(packages, isMonorepo)
    }
  }
}

const fails = results.filter((r) => r.status === 'fail').length
const warns = results.filter((r) => r.status === 'warn').length

if (asJson) {
  console.log(JSON.stringify({ mode: isPost ? 'post' : 'pre', cwd, fails, warns, results }, null, 2))
} else {
  const ICONS = { pass: '✓', fail: '✗', warn: '⚠', info: '·' }
  for (const r of results) console.log(`${ICONS[r.status]} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
  console.log(`\n${isPost ? 'postflight' : 'preflight'}: ${fails} fail, ${warns} warn, 共 ${results.length} 项`)
}

process.exit(fails > 0 ? 1 : 0)
