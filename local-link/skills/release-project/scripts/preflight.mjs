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
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const isPost = argv.includes('--post')
const asJson = argv.includes('--json')
const cwdFlag = argv.indexOf('--cwd')
const cwd = cwdFlag !== -1 ? argv[cwdFlag + 1] : process.cwd()

const NPM_REGISTRY = 'https://registry.npmjs.org'
const results = []

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

function checkReleaseScripts(pkg) {
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

function checkVersionConsistency(pkg, changelogVersion) {
  if (!pkg.version) return
  const tag = run(`git tag -l v${pkg.version}`)
  if (tag.ok && tag.out) {
    report('版本 tag', 'fail', `v${pkg.version} 已存在，禁止重复发版，先升级版本号`)
  } else {
    report('版本 tag', 'pass', `v${pkg.version} 未被占用`)
  }
  if (changelogVersion && changelogVersion !== pkg.version) {
    report(
      '版本一致性',
      'warn',
      `package.json (${pkg.version}) 与 CHANGELOG 最新段 (${changelogVersion}) 不一致；若处于版本号升级前属正常`,
    )
  }
}

/** npm registry 检测：404 = 首发。显式锁官方源，避免镜像同步延迟造成假阴性 */
function checkRegistry(pkg) {
  if (pkg.private) {
    report('npm registry', 'info', 'private 包，跳过')
    return
  }
  const r = run(`npm view ${pkg.name} version --registry ${NPM_REGISTRY}`, 15_000)
  if (r.ok && r.out) {
    report('npm registry', 'info', `已发布，latest = ${r.out}`)
  } else if (/E404|404/.test(r.err)) {
    report('npm registry', 'info', '查无此包（404）= npm 首发，走「6. 首次发布检测」')
  } else {
    report('npm registry', 'warn', `查询失败（网络/认证），无法判定首发状态: ${r.err.slice(0, 120)}`)
  }
}

// ─── 发布后校验 ──────────────────────────────────────────────

function checkPostTag(pkg) {
  const tag = `v${pkg.version}`
  if (run(`git tag -l ${tag}`).out === tag) {
    report('git tag', 'pass', `${tag} 已创建`)
  } else {
    report('git tag', 'fail', `${tag} 不存在，发版未完成`)
  }
  if (run(`git ls-remote --tags origin ${tag}`, 20_000).out.includes(tag)) {
    report('远程 tag', 'pass', `${tag} 已推送`)
  } else {
    report('远程 tag', 'warn', `${tag} 未在远程，确认是否已 push --tags`)
  }
}

function checkPostRegistry(pkg) {
  if (pkg.private) return
  const v = run(`npm view ${pkg.name}@${pkg.version} version --registry ${NPM_REGISTRY}`, 15_000)
  if (v.ok && v.out === pkg.version) {
    report('registry 版本', 'pass', `${pkg.name}@${pkg.version} 可查`)
  } else {
    report('registry 版本', 'fail', `官方源查不到 ${pkg.name}@${pkg.version}（刚发布可能有秒级延迟，稍后重试）`)
  }

  const tags = run(`npm view ${pkg.name} dist-tags --json --registry ${NPM_REGISTRY}`, 15_000)
  if (tags.ok && tags.out) {
    report('dist-tags', 'info', tags.out.replace(/\s+/g, ' ').trim())
  }

  // workspace:* 残留会让安装方直接失败，必须拦截
  const deps = run(`npm view ${pkg.name}@${pkg.version} dependencies --json --registry ${NPM_REGISTRY}`, 15_000)
  if (deps.ok && /workspace:/.test(deps.out)) {
    report('workspace 协议', 'fail', '已发布包的 dependencies 仍含 workspace:*，应使用 pnpm publish')
  } else if (deps.ok) {
    report('workspace 协议', 'pass', 'dependencies 无 workspace:* 残留')
  }
}

// ─── 主流程 ──────────────────────────────────────────────────

if (checkGitRepo()) {
  const pkg = readPackage()
  if (pkg) {
    report('包', 'info', `${pkg.name ?? '(unnamed)'}@${pkg.version ?? '?'}${pkg.private ? ' (private)' : ''}`)
  }

  if (isPost) {
    if (pkg) {
      checkPostTag(pkg)
      checkPostRegistry(pkg)
    }
  } else {
    checkWorktree()
    checkBranchSync()
    probeBranchModel()
    const changelogVersion = checkChangelog()
    if (pkg) {
      checkReleaseScripts(pkg)
      checkVersionConsistency(pkg, changelogVersion)
      checkRegistry(pkg)
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
