# My Blog 用户手册

## 一、环境准备

### 1.1 安装 Node.js

本项目需要 **Node.js 18.17.1** 或更高版本。

**Windows 安装方式：**

1. 访问 https://nodejs.org
2. 下载 LTS（长期支持）版本
3. 运行安装程序，一路 Next 即可
4. 打开终端验证安装：

```bash
node --version   # 应显示 v18.x 或更高
npm --version    # 应显示 9.x 或更高
```

### 1.2 安装 Git（可选，用于版本管理和部署）

1. 访问 https://git-scm.com
2. 下载并安装
3. 验证：`git --version`

### 1.3 安装代码编辑器

推荐使用 **VS Code**：https://code.visualstudio.com

推荐安装以下 VS Code 扩展：
- **Astro** — Astro 语法高亮和智能提示
- **Tailwind CSS IntelliSense** — Tailwind 类名自动补全
- **Chinese (Simplified)** — 中文语言包（可选）

---

## 二、启动项目

### 2.1 安装依赖

打开终端，进入项目目录：

```bash
cd my-blog
npm install
```

### 2.2 启动开发服务器

```bash
npm run dev
```

终端会显示类似信息：

```
🚀 astro dev server running at:
   Local:    http://localhost:4321/
```

在浏览器打开 http://localhost:4321 即可预览博客。

### 2.3 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 2.4 本地预览生产版本

```bash
npm run preview
```

---

## 三、写文章

### 3.1 创建新文章

在 `src/content/posts/` 目录下新建 `.md` 文件。

**文件命名规则：** 使用英文、数字和短横线，例如：
- `my-first-post.md`
- `learning-react-2026.md`
- `daily-note-0409.md`

文件名会成为文章的 URL 路径，例如 `my-first-post.md` → `/posts/my-first-post`

### 3.2 文章格式

每篇文章需要以 **frontmatter** 开头（`---` 之间的内容为元数据）：

```markdown
---
title: "文章标题"
description: "一句话描述（可选，显示在文章列表）"
pubDate: 2026-04-09
tags: ["标签1", "标签2"]
draft: false
---

正文内容写在这里...
```

**frontmatter 字段说明：**

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `title` | 是 | 字符串 | 文章标题 |
| `description` | 否 | 字符串 | 文章描述，显示在列表页 |
| `pubDate` | 是 | 日期 | 发布日期，格式 `YYYY-MM-DD` |
| `tags` | 否 | 数组 | 标签列表 |
| `draft` | 否 | 布尔 | 设为 `true` 则不会发布 |

### 3.3 Markdown 语法速查

```markdown
# 一级标题
## 二级标题
### 三级标题

**加粗文本**
*斜体文本*
~~删除线~~

- 无序列表
- 第二项

1. 有序列表
2. 第二项

[链接文字](https://example.com)

![图片描述](/images/photo.jpg)

> 引用文字

`行内代码`

​```javascript
// 代码块
console.log('Hello');
​```

| 表头1 | 表头2 |
|-------|-------|
| 内容1 | 内容2 |
```

### 3.4 添加图片

1. 将图片放入 `public/images/` 目录
2. 在文章中引用：`![描述](/images/文件名.jpg)`

---

## 四、自定义配置

### 4.1 修改博客名称

编辑 `src/components/Header.astro`，修改博客名称：

```html
<a href="/" class="text-xl font-bold ...">
  My Blog  <!-- 改为你的博客名称 -->
</a>
```

### 4.2 修改关于页

编辑 `src/pages/about.astro`，修改个人介绍内容。

### 4.3 修改页脚

编辑 `src/components/Footer.astro`，修改版权信息。

### 4.4 配置评论系统（Giscus）

1. 在 GitHub 创建一个公开仓库
2. 进入仓库 Settings → Features → 勾选 Discussions
3. 安装 Giscus App：https://github.com/apps/giscus
4. 访问 https://giscus.app ，填入仓库信息，获取配置参数
5. 编辑 `src/components/Giscus.astro`，替换以下字段：
   - `data-repo` → 你的仓库（如 `username/blog-comments`）
   - `data-repo-id` → 从 giscus.app 获取
   - `data-category-id` → 从 giscus.app 获取

### 4.5 修改网站域名

编辑 `astro.config.mjs`：

```js
export default defineConfig({
  site: 'https://yourdomain.com',  // 改为你的域名
});
```

---

## 五、部署上线

### 方式一：Vercel（推荐）

1. 将代码推送到 GitHub：

```bash
git init
git add .
git commit -m "初始化博客"
git remote add origin https://github.com/你的用户名/my-blog.git
git push -u origin main
```

2. 访问 https://vercel.com ，用 GitHub 账号登录
3. 点击 "Import Project" → 选择你的仓库
4. Vercel 会自动识别 Astro 项目，点击 "Deploy"
5. 部署完成后会获得一个 `xxx.vercel.app` 域名

**之后每次推送代码到 GitHub，Vercel 会自动重新部署。**

### 方式二：Netlify

1. 推送代码到 GitHub（同上）
2. 访问 https://netlify.com ，用 GitHub 账号登录
3. 点击 "Add new site" → "Import an existing project"
4. 选择仓库，构建命令填 `npm run build`，发布目录填 `dist`
5. 点击 "Deploy"

### 方式三：GitHub Pages

1. 安装 GitHub Pages 适配器（如需要）
2. 在仓库 Settings → Pages 中配置
3. 具体步骤参考：https://docs.astro.build/en/guides/deploy/github/

---

## 六、常用命令速查

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 (localhost:4321) |
| `npm run build` | 构建生产版本 |
| `npm run preview` | 预览生产版本 |
| `git add .` | 暂存所有修改 |
| `git commit -m "描述"` | 提交修改 |
| `git push` | 推送到远程仓库 |

---

## 七、常见问题

### Q: 新建的文章没有显示？

- 检查 frontmatter 中 `draft` 是否设为 `true`（设为 `false` 或删除该字段）
- 检查文件是否放在 `src/content/posts/` 目录下
- 检查文件扩展名是否为 `.md`
- 重启开发服务器：`Ctrl+C` 后重新 `npm run dev`

### Q: 样式没有生效？

- 确保 `src/styles/global.css` 的第一行是 `@import "tailwindcss";`
- 重启开发服务器

### Q: 图片不显示？

- 确认图片放在 `public/images/` 目录下
- 引用路径以 `/images/` 开头（注意开头的斜杠）

### Q: 如何修改首页的欢迎文字？

编辑 `src/pages/index.astro` 中的 `<h1>` 和 `<p>` 标签内容。

---

## 八、项目结构一览

```
my-blog/
├── public/                    # 静态资源
│   ├── favicon.svg            # 网站图标
│   ├── robots.txt             # 搜索引擎配置
│   └── images/                # 图片目录
├── src/
│   ├── components/            # 组件
│   │   ├── Header.astro       # 导航栏
│   │   ├── Footer.astro       # 页脚
│   │   ├── PostCard.astro     # 文章卡片
│   │   ├── TagList.astro      # 标签列表
│   │   └── Giscus.astro       # 评论组件
│   ├── content/posts/         # ★ 文章目录（在这里写文章）
│   ├── layouts/               # 布局模板
│   ├── pages/                 # 页面路由
│   ├── styles/global.css      # 全局样式
│   └── utils/date.ts          # 工具函数
├── astro.config.mjs           # Astro 配置
├── package.json               # 项目依赖
└── tsconfig.json              # TypeScript 配置
```
