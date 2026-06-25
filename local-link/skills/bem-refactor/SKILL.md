---
name: bem-refactor
description: |
  将 Vue 组件重构为使用 BEM（Block-Element-Modifier）命名规范。

  使用场景：
  - 用户说"用 useBEM 改造这个组件"
  - 用户说"给这个组件加上 BEM 类名"
  - 用户要求重构组件以符合项目 BEM 规范
  - 需要将 Tailwind 工具类与 BEM 语义类名结合使用

  触发关键词：useBEM、BEM、重构组件、BEM 改造、bem-refactor
argument-hint: <file or component>
disable-model-invocation: true
---

# BEM 组件重构指南

## 工作流程

### 1. 分析现有代码

读取目标文件，了解：
- 组件结构和层级关系
- 现有的 class 命名方式
- 是否需要保留 Tailwind 工具类

### 2. 查找项目 BEM 规范

搜索项目中的 useBEM 使用方式：
- 查找 `useBEM` 的实现位置（通常在 `app/composables/bem/`）
- 查看 CONVENTIONS.md 中的 BEM 命名规范
- 了解项目约定的 block 前缀（如 `page-*`, `cmpt-*`, `layout-*`）

### 3. 确定 Block 名称

根据组件类型和位置，选择合适的 block 名：

| 组件类型 | Block 前缀示例 |
|---------|--------------|
| 页面级组件 | `page-xxx` |
| 可复用 UI 组件 | `cmpt-xxx` |
| 布局组件 | `layout-xxx` |

### 4. 重构模板

引入 useBEM：

```ts
const { b, e, is } = useBEM('block-name')
```

类名绑定规则：
- **静态 Tailwind 类名** → 使用 `class`
- **动态 BEM 类名** → 使用 `:class`

示例：

```vue
<!-- Before -->
<div class="px-6 py-4 bg-white rounded-sm">
  <h2 class="text-lg font-semibold text-gray-900">标题</h2>
</div>

<!-- After -->
<div class="px-6 py-4 bg-white rounded-sm" :class="e('header')">
  <h2 class="text-lg font-semibold text-gray-900" :class="e('title')">标题</h2>
</div>
```

### 5. 添加 Style Block

在组件末尾添加嵌套 BEM 结构的 style 占位：

```vue
<style scoped lang="css">
.p-block-name {
  /* container */

  &__header {
    /* header wrapper */

    &-inner {
      /* header inner */
    }
  }

  &__title {
    /* title element */
  }

  &__main {
    /* main content */

    &.is-empty {
      /* modifier state */
    }
  }
}
</style>
```

## 完整示例

**重构前：**

```vue
<template>
  <div class="w-full">
    <div class="px-6 py-4 bg-white rounded-sm">
      <h2 class="text-lg font-semibold">{{ title }}</h2>
    </div>
    <div class="main bg-white rounded-sm">
      <slot />
    </div>
  </div>
</template>
```

**重构后：**

```vue
<script setup lang="ts">
const { b, e, is } = useBEM('page-saas')

const props = defineProps<{
  title?: string
}>()
</script>

<template>
  <div class="w-full" :class="b()">
    <div class="px-6 py-4 bg-white rounded-sm" :class="e('header')">
      <h2 class="text-lg font-semibold" :class="e('title')">{{ title }}</h2>
    </div>
    <div class="bg-white rounded-sm" :class="e('main')">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="css">
.p-page-saas {
  /* container */

  &__header {
    /* header wrapper */
  }

  &__title {
    /* page title */
  }

  &__main {
    /* main content */
  }
}
</style>
```

## 注意事项

1. **保留 Tailwind 类名**：如果项目使用 Tailwind，保留工具类用于实际样式，BEM 类名用于语义标记
2. **v-tw-merge 指令**：在根元素上使用 `v-tw-merge` 指令确保 class 合并正确
3. **状态修饰符**：使用 `is('state')` 生成状态类名（如 `is-empty`）
4. **空规则占位**：在 style block 中使用注释占位，避免 lint 警告
