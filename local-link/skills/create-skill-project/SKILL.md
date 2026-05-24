---
name: create-skill-project
description: 创建新的 Claude Skill 项目，初始化 GitHub 仓库、本地 submodule 和软链接。用于将现有 skill 或新 skill 按照标准项目结构组织，支持 Git 版本管理和本地开发。使用场景：(1) 创建新的 skill 项目并推送到 GitHub (2) 将现有 skill 重构为标准项目结构 (3) 初始化 submodule 和软链接以便本地开发。
disable-model-invocation: true
---

# Create Skill

创建新的 Claude Skill 项目，初始化 GitHub 仓库、本地 submodule 和软链接。

## 上下文

* **技能名称（skill-name）**：从上下文识别用户意图抽取变量，若识别失败则创建几个选项询问用户做选择
* **项目名称（project-name）**：`${<skill-name>}-skills`，即技能名称加后缀，但当心后缀重复

**注意**，技能名称不应当有后缀“-skills”，项目名称才允许有（注意去重，避免出现 x-skill-skills 这种情况）

## 工作流程

### 1. 创建 GitHub 仓库

使用 gh-cli 创建新的 public 仓库：

```bash
gh repo create <project-name> --public --description "<description>"
```

### 2. 初始化 Submodule

在 `local-link/skills` 目录下添加 submodule：

```bash
cd ~/G/Local/local-link/skills
git submodule add https://github.com/Lionad-Morotar/<project-name>.git <project-name>
```

**注意**：如果仓库是空的，需要先在仓库中创建初始提交（如 README.md）。

### 3. 复制现有文件（如适用）

如果 `~/.claude/skills/<skill-name>` 已存在，复制其内容到 submodule：

```bash
cp -r ~/.claude/skills/<skill-name>/* ~/G/Local/local-link/skills/<project-name>/
```

### 4. 创建软链接

删除旧的 skill 目录，创建指向 submodule 的软链接：

```bash
# 1. backup
# 2. rm -rf ~/.claude/skills/<skill-name>
# 3. ln -s ~/G/Local/local-link/skills/<project-name>/skills/<skill-name> ~/.claude/skills/<skill-name>
```

**注意**：软链接应指向 `skills/<skill-name>` 子目录（如果采用 translating-project 模式）。

### 5. 提交并推送

```bash
cd ~/G/Local/local-link/skills/<project-name>
git add -A
git commit -m "Initial commit"
git push
```

## 项目结构

推荐的项目结构：

```
<project-name>/
├── README.md              # 项目说明（基础模版见下方）
├── skills/
│   └── <skill-name>/      # Skill 目录
│       ├── SKILL.md       # Skill 定义
│       ├── reference/     # 参考文档（可选）
│       ├── scripts/       # 脚本（可选）
│       └── assets/        # 资源文件（可选）
```

### README.md 基础模版

仿照 [`gh-cli-skill/README.md`](https://github.com/Lionad-Morotar/gh-cli-skill/blob/main/README.md) 的简洁结构：

```markdown
# <project-name>

<一句话描述 skill 的用途>

## 安装

```bash
npx skills add -g Lionad-Morotar/<project-name>
```

## 使用

```sh
/<skill-name> {你的要求}
```

如果你的 IDE 不支持 SlashCommand，那么为了获得最可靠的结果，需要提示词前加上前缀，比如：

```plaintext
使用 <skill-name> 技能，{你的要求}
```

这会明确触发技能并确保 AI 遵循文档化的模式。如果不加前缀，技能触发可能不一致，具体取决于你的提示词与技能描述关键词的匹配程度。
```

## 安全配置最佳实践（重要）

如果 skill 需要 API 密钥或敏感凭证，**必须**遵循以下安全准则：

### 1. 配置文件位置

凭证必须存储在用户主目录下的隐藏配置目录，**禁止**存储在项目目录中：

```
~/.config/<skill-name>/.env
```

### 2. 文件权限

配置文件必须设置 600 权限（仅所有者可读写）：

```bash
mkdir -p ~/.config/<skill-name>
touch ~/.config/<skill-name>/.env
chmod 600 ~/.config/<skill-name>/.env
```

### 3. 凭证读取逻辑

脚本读取凭证时优先检查安全目录，保留向后兼容：

```python
from pathlib import Path
from dotenv import load_dotenv

# 优先级 1: 安全配置目录
home_config = Path.home() / ".config" / "<skill-name>" / ".env"
# 优先级 2: 本地 .env（向后兼容）
local_env = Path(__file__).parent.parent / ".env"

if home_config.exists():
    load_dotenv(home_config)
elif local_env.exists():
    load_dotenv(local_env)
```

### 4. SKILL.md 中的内容优化

4.1 SKILL.md 必须使用技能 `/skill-creator` 创建，已达到最优效果
4.2 必须在 SKILL.md 中明确指示用户**手动创建配置文件**，禁止在聊天中发送凭证：

```markdown
**DO NOT paste credentials in chat**. Instead:
1. Create config file at `~/.config/<skill-name>/.env`
2. Add your credentials to that file (never share in chat)
3. Run smoke test to verify
```

### 5. 检查清单

- [ ] GitHub 仓库已创建
- [ ] Submodule 路径正确（`local-link/skills/<skill-name>`）
- [ ] `.gitmodules` 中没有重复条目
- [ ] 软链接指向正确的路径
- [ ] 所有文件已提交并推送到远程
- [ ] 检测 SKILL.md 以及关联文件，确保**安全配置已实施**（如需要 API 凭证）
  - [ ] 使用 `~/.config/<skill-name>/.env` 存储凭证
  - [ ] 脚本设置 600 文件权限
  - [ ] SKILL.md 包含安全警告和手动配置说明

## 常见问题

### Submodule 路径错误

如果 `.gitmodules` 中有重复条目，手动清理：

```bash
# 删除错误的条目
# 编辑 .gitmodules 文件，保留正确的路径

# 清理 git config
git config --remove-section submodule.<wrong-name>
```

### 空仓库无法添加 submodule

如果仓库是空的，先创建初始提交：

```bash
git checkout -b main
echo "# <skill-name>" > README.md
git add README.md
git commit -m "Initial commit"
git push -u origin main
```
