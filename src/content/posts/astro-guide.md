---
title: "Astro 入门指南：从零搭建个人博客"
description: "一篇面向新手的 Astro 教程，教你如何从零开始搭建一个现代化的个人博客。"
pubDate: 2026-04-09
tags: ["Astro", "前端", "教程"]
draft: false
---

## 什么是 Astro？

Astro 是一个现代的静态站点生成器，专为内容驱动的网站设计。它有以下特点：

- **零 JS 默认** — 默认不向客户端发送 JavaScript
- **组件岛屿** — 只在需要交互的地方加载 JS
- **多框架支持** — 可以混用 React、Vue、Svelte 等
- **Markdown 优先** — 原生支持 Markdown/MDX 写作

## 快速开始

### 1. 创建项目

```bash
npm create astro@latest my-blog
cd my-blog
npm run dev
```

### 2. 项目结构

```
src/
├── content/posts/   # Markdown 文章
├── components/      # 可复用组件
├── layouts/         # 页面布局
└── pages/           # 页面路由
```

### 3. 写一篇文章

在 `src/content/posts/` 下创建 `.md` 文件：

```markdown
---
title: "文章标题"
pubDate: 2026-04-09
tags: ["标签"]
---

正文内容...
```

### 4. 部署

推荐使用 Vercel 一键部署：

1. 将代码推送到 GitHub
2. 在 Vercel 导入仓库
3. 自动识别 Astro 项目并部署

就这么简单！

## 总结

Astro 非常适合搭建博客和文档站点。写作体验好，构建速度快，部署也很方便。如果你也在考虑搭建个人博客，不妨试试 Astro。
