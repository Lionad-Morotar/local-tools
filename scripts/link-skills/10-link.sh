#!/usr/bin/env bash

# 检查 SKILL.md frontmatter 中是否包含 disable-model-invocation: true
skill_has_disable_model_invocation() {
  local skill_file="$1/SKILL.md"
  if [ -f "$skill_file" ]; then
    local value
    value=$(sed -n '/^---$/,/^---$/p' "$skill_file" | grep -E '^disable-model-invocation:' | awk '{print $2}' | tr -d '[:space:]')
    [ "$value" = "true" ]
  else
    return 1
  fi
}

# 生成 skill name 的首字母缩写（按 - 和 _ 分割）
generate_acronym() {
  local name="$1"
  echo "$name" | awk -F'[-_]' '{for(i=1;i<=NF;i++) printf substr($i,1,1)}'
}

# 实际执行链接
step_link_skills() {
  # 将 local-link/skills 下的 skill 目录链接到 Claude skills 目录。
  local src_root="$1"
  local dest_root="$2"
  local max_depth="${3:-${LINK_SKILLS_MAX_DEPTH:-3}}"

  log "[link-skills] Source: $src_root"
  log "[link-skills] Destination root: $dest_root"
  log "[link-skills] Max depth: $max_depth"

  if [ ! -d "$src_root" ]; then
    log_skip "[link-skills] No source skills directory found at $src_root. Nothing to do."
    return 0
  fi

  mkdir -p "$dest_root"

  if ! [[ "$max_depth" =~ ^[0-9]+$ ]]; then
    warn "[link-skills] Invalid max_depth='$max_depth'. Fallback to 3."
    max_depth=3
  fi

  local src_root_resolved
  src_root_resolved="$(cd "$src_root" 2>/dev/null && pwd -P)"
  if [ -n "$src_root_resolved" ]; then
    log "[link-skills] Source (resolved): $src_root_resolved"
  fi

  local found_any=0
  local found_count=0
  local eligible_file
  eligible_file=$(mktemp)

  _link_skills_scan_dir() {
    local dir="$1"
    local depth="$2"

    # 仅当目录中存在 SKILL.md（忽略大小写）才认为这是一个技能目录。
    if compgen -G "$dir/[Ss][Kk][Ii][Ll][Ll].[Mm][Dd]" > /dev/null; then
      found_any=1
      found_count=$((found_count + 1))

      local skill_name dest_link
      skill_name="$(basename "$dir")"
      dest_link="$dest_root/$skill_name"

      safe_symlink "$dir" "$dest_link"
      log_ok "[link-skills] ${_C_BOLD}$skill_name${_C_RESET} -> $dir"

      if skill_has_disable_model_invocation "$dir"; then
        echo "$skill_name $dir" >> "$eligible_file"
      fi
    fi

    [ "$depth" -gt 0 ] || return 0

    shopt -s nullglob
    local child
    for child in "$dir"/*; do
      [ -d "$child" ] || continue
      _link_skills_scan_dir "$child" $((depth - 1))
    done
  }

  _link_skills_scan_dir "$src_root" "$max_depth"

  if [ "$found_any" -eq 1 ]; then
    log_ok "[link-skills] ${_C_BOLD}$found_count${_C_RESET} skill(s) linked"
  fi

  if [ "$found_any" -eq 0 ]; then
    log_skip "[link-skills] No SKILL.md found under $src_root (dir max depth: $max_depth)."
  fi

  # 为 disable-model-invocation: true 的技能创建首字母缩写 symlink
  if [ -s "$eligible_file" ]; then
    local occupied_file
    occupied_file=$(mktemp)

    while IFS=' ' read -r skill_name dir; do
      local acronym
      acronym="$(generate_acronym "$skill_name")"

      if [ -z "$acronym" ]; then
        continue
      fi

      if grep -qx "$acronym" "$occupied_file" 2>/dev/null; then
        warn "[link-skills] Acronym conflict: $acronym already taken. Skipping $skill_name"
        continue
      fi

      echo "$acronym" >> "$occupied_file"
      local acronym_link
      acronym_link="$dest_root/$acronym"
      safe_symlink "$dir" "$acronym_link"
      log_ok "[link-skills] Acronym ${_C_BOLD}$acronym${_C_RESET} -> $skill_name"
    done < <(sort "$eligible_file")

    rm -f "$occupied_file"
  fi

  rm -f "$eligible_file"
}

# Dry run 模式 - 只预览，不执行
step_link_skills_dry_run() {
  local src_root="$1"
  local dest_root="$2"
  local max_depth="${3:-${LINK_SKILLS_MAX_DEPTH:-3}}"

  log "[link-skills] Source: $src_root"
  log "[link-skills] Destination root: $dest_root"
  log "[link-skills] Max depth: $max_depth"

  if [ ! -d "$src_root" ]; then
    log_skip "[link-skills] ⚠️ No source skills directory found at $src_root"
    return 0
  fi

  if [ ! -d "$dest_root" ]; then
    log_skip "[link-skills] 📁 Destination directory does not exist yet: $dest_root"
  fi

  if ! [[ "$max_depth" =~ ^[0-9]+$ ]]; then
    warn "[link-skills] Invalid max_depth='$max_depth'. Fallback to 3."
    max_depth=3
  fi

  local src_root_resolved
  src_root_resolved="$(cd "$src_root" 2>/dev/null && pwd -P)"
  if [ -n "$src_root_resolved" ]; then
    log "[link-skills] Source (resolved): $src_root_resolved"
  fi

  local found_any=0
  local found_count=0
  local to_create=0
  local to_update=0
  local existing=0
  local eligible_file
  eligible_file=$(mktemp)

  _link_skills_scan_dir_dry() {
    local dir="$1"
    local depth="$2"

    if compgen -G "$dir/[Ss][Kk][Ii][Ll][Ll].[Mm][Dd]" > /dev/null; then
      found_any=1
      found_count=$((found_count + 1))

      local skill_name dest_link
      skill_name="$(basename "$dir")"
      dest_link="$dest_root/$skill_name"

      if [ -L "$dest_link" ]; then
        local current_target
        current_target="$(readlink "$dest_link" 2>/dev/null || echo "")"
        if [ "$current_target" = "$dir" ]; then
          log_ok "[link-skills] ✅ Already linked: ${_C_BOLD}$skill_name${_C_RESET}"
          existing=$((existing + 1))
        else
          log_skip "[link-skills] 🔄 Would update: ${_C_BOLD}$skill_name${_C_RESET}"
          log "[link-skills]    Current:  $dest_link -> $current_target"
          log "[link-skills]    New:      $dest_link -> $dir"
          to_update=$((to_update + 1))
        fi
      elif [ -e "$dest_link" ]; then
        warn "[link-skills] ⚠️ Would overwrite (not a symlink): $skill_name"
        to_update=$((to_update + 1))
      else
        log_info "[link-skills] ➕ Would create: ${_C_BOLD}$skill_name${_C_RESET} -> $dir"
        to_create=$((to_create + 1))
      fi

      if skill_has_disable_model_invocation "$dir"; then
        echo "$skill_name $dir" >> "$eligible_file"
      fi
    fi

    [ "$depth" -gt 0 ] || return 0

    shopt -s nullglob
    local child
    for child in "$dir"/*; do
      [ -d "$child" ] || continue
      _link_skills_scan_dir_dry "$child" $((depth - 1))
    done
  }

  _link_skills_scan_dir_dry "$src_root" "$max_depth"

  echo ""
  log_step "[link-skills] Summary: $found_count skill(s) found"
  log_ok "   ✅ Existing:  $existing"
  log_info "   ➕ To create: $to_create"
  log_skip "   🔄 To update: $to_update"
  echo ""

  # dry-run：预览 acronym symlink
  if [ -s "$eligible_file" ]; then
    local occupied_file
    occupied_file=$(mktemp)

    log_step "[link-skills] Acronym preview"
    while IFS=' ' read -r skill_name dir; do
      local acronym dest_link
      acronym="$(generate_acronym "$skill_name")"
      dest_link="$dest_root/$acronym"

      if [ -z "$acronym" ]; then
        continue
      fi

      if grep -qx "$acronym" "$occupied_file" 2>/dev/null; then
        log_skip "[link-skills] Would skip acronym: $acronym (conflict) -> $skill_name"
        continue
      fi

      echo "$acronym" >> "$occupied_file"

      if [ -L "$dest_link" ]; then
        local current_target
        current_target="$(readlink "$dest_link" 2>/dev/null || echo "")"
        if [ "$current_target" = "$dir" ]; then
          log_ok "[link-skills] Acronym already linked: $acronym -> $skill_name"
        else
          log_skip "[link-skills] Would update acronym: $acronym -> $skill_name"
        fi
      elif [ -e "$dest_link" ]; then
        warn "[link-skills] Would overwrite acronym (not a symlink): $acronym -> $skill_name"
      else
        log_info "[link-skills] Would create acronym: $acronym -> $skill_name"
      fi
    done < <(sort "$eligible_file")
    echo ""

    rm -f "$occupied_file"
  fi

  rm -f "$eligible_file"
}
