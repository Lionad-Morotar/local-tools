# 首次发布 & npm 准备

**触发时机**：技能第 6 步检测（`npm view <pkg> version --registry https://registry.npmjs.org` 返回 404）确认包从未上架，且用户确认需要协助后。

## npm 发布准备流程

1. **获取 GitHub 用户信息**：
   ```bash
   gh api user -q '.login, .name, .email, .html_url'
   ```

2. **完善 package.json 字段**：
   ```json
   {
     "author": "用户名 <邮箱> (个人主页)",
     "repository": {
       "type": "git",
       "url": "git+https://github.com/用户名/仓库名.git"
     },
     "bugs": {
       "url": "https://github.com/用户名/仓库名/issues"
     },
     "homepage": "https://github.com/用户名/仓库名#readme",
     "keywords": ["keyword1", "keyword2", "keyword3"],
     "license": "MIT",
     "publishConfig": {
       "registry": "https://registry.npmjs.org/",
       "access": "public"
     }
   }
   ```

3. **提交发布准备变更**：
   ```bash
   git add package.json
   git commit -m "chore: release prepare"
   ```

4. **验证 package.json 格式**：
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('./package.json'))" && echo "格式正确"
   ```

## 首次发布额外检查清单

- [ ] package.json 包含完整的 author 信息
- [ ] repository 字段指向正确的 GitHub 仓库
- [ ] bugs 和 homepage 字段已配置
- [ ] keywords 包含相关关键词（至少 5 个）
- [ ] license 已声明（MIT/ISC/Apache 等）
- [ ] publishConfig 配置了正确的 registry（发布前置条件，preflight `publish registry` 项强制检查，不依赖本清单）
- [ ] publishConfig.access 设置为 "public"（scoped 包必需）
- [ ] 发布准备已提交：`chore: release prepare`
- [ ] 运行 `npm publish --dry-run` 预览发布内容
