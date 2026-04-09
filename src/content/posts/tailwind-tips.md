---
title: "学习笔记：Tailwind CSS 实用技巧"
description: "分享一些我在使用 Tailwind CSS 过程中总结的实用技巧和最佳实践。"
pubDate: 2026-04-08
tags: ["Tailwind CSS", "CSS", "前端"]
draft: false
---

## 为什么选择 Tailwind CSS？

Tailwind CSS 是一个实用优先（utility-first）的 CSS 框架。相比传统 CSS 写法，它的优势在于：

- **开发速度快** — 不用切换文件写 CSS
- **一致性好** — 使用统一的设计系统
- **包体积小** — 只打包用到的样式

## 实用技巧

### 1. 响应式设计

Tailwind 使用移动优先的断点系统：

```html
<div class="text-sm md:text-base lg:text-lg">
  响应式文字大小
</div>
```

| 前缀 | 最小宽度 | 说明 |
|------|----------|------|
| `sm` | 640px | 手机横屏 |
| `md` | 768px | 平板 |
| `lg` | 1024px | 笔记本 |
| `xl` | 1280px | 桌面 |

### 2. 暗色模式

```html
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-white">
  自动适配暗色模式
</div>
```

### 3. 常用组合

**卡片布局：**

```html
<div class="rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
  卡片内容
</div>
```

**居中布局：**

```html
<div class="flex items-center justify-center min-h-screen">
  垂直水平居中
</div>
```

## 总结

Tailwind CSS 上手需要一点时间，但一旦习惯后开发效率会大幅提升。建议配合 VS Code 的 Tailwind CSS IntelliSense 插件使用，体验更佳。
