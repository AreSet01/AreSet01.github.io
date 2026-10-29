---
title: '「清浅」开源博客主题快速上手与部署指南'
description: '从项目克隆、本地开发调试、个性化配置到自动化部署 GitHub Pages 或私有自建服务器的完整指南。'
pubDate: 2026-10-26
tags: ['Astro', '部署', '开源', '配置']
category: '使用指南'
series: '主题使用手册'
seriesOrder: 3
---

# 「清浅」开源主题使用与部署指南

欢迎使用「清浅」东方纸境博客模板！本文是一份详细的新手指南，帮助你在 5 分钟内完成克隆、本地运行，并根据你的需求发布上线。

---

## 一、 技术栈概览

* **核心框架**：[Astro 5](https://astro.build)（超高性能静态生成，极致加载速度）
* **样式引擎**：[Tailwind CSS v4](https://tailwindcss.com)（现代高性能纯 CSS 原生引擎）
* **动效系统**：[GSAP](https://greensock.com/gsap/) + [Lenis](https://lenis.darkroom.engineering/)（平滑滚动与合成器图层动画）
* **富文本与图表**：Shiki 语法高亮 + KaTeX 数学渲染 + Mermaid 流程图无级缩放
* **伴读与笔记**：原生 Node.js 流式伴读服务（`server/ask.mjs`）+ LocalStorage 笔记中心

---

## 二、 本地快速启动

### 2.1 环境要求
- Node.js 18.17.1 或更高版本（推荐 Node 20 LTS / 22）
- npm 或 pnpm

### 2.2 克隆与运行

```bash
# 1. 克隆本仓库
git clone https://github.com/AreSet01/AreSet01.github.io.git my-blog
cd my-blog

# 2. 安装依赖
npm install

# 3. 启动本地开发服务
npm run dev
```

在浏览器打开 `http://localhost:4321`，即可看到完整的博客页面与开屏动效。

---

## 三、 个性化你的博客

### 3.1 站点标题与基本信息
打开根目录的 `astro.config.mjs`：
```javascript
export default defineConfig({
  site: 'https://yourname.github.io', // 替换为你自己的域名或 GitHub Pages 地址
});
```

打开 `src/layouts/BaseLayout.astro` 与 `src/components/SiteIntro.astro`，即可自定义开屏标题文字与站点元信息。

### 3.2 撰写新文章
所有 Markdown 文章存放在 `src/content/posts/` 目录下。只需新建 `.md` 文件并填写 Frontmatter：

```markdown
---
title: '我的第一篇博客'
description: '记录今日的所思所想'
pubDate: 2026-10-29
tags: ['随笔', '思考']
category: '生活记录'
---

正文内容...
```

### 3.3 自定义相簿与好去处
- **相簿数据**：在 `src/data/gallery.ts` 中配置你的摄影作品与 EXIF 参数，并将图片放置在 `public/images/gallery/`。
- **生活去处**：在 `src/data/life.ts` 中记录私藏景点、打卡体验与随身好物。

---

## 四、 部署方案选择

### 方案 A：GitHub Pages 纯静态部署（零成本 · 推荐）
1. 将你的代码推送到 GitHub 的 `main` 分支。
2. 在仓库主页点击 **Settings** → **Pages**，将 **Build and deployment** > **Source** 选为 **GitHub Actions**。
3. 仓库内已预置 `.github/workflows/deploy.yml`，每次推送将自动打包并发布。
4. 静态模式下，伴读助手会自动启用 **Demo 模拟演示模式**，笔记功能正常使用浏览器本地存储。

### 方案 B：自建私有服务器部署（全功能）
若希望开启由私有大模型驱动的流式问答与跨设备笔记同步：
1. 本地执行打包：
   ```bash
   npm run build
   ```
2. 将 `dist/` 静态产物托管至 Nginx。
3. 在服务器启动伴读服务：
   ```bash
   AI_API_KEY=your_key node server/ask.mjs
   ```
4. 在 Nginx 中将 `/api/ask` 与 `/api/notes` 反向代理至本地端口 `8787` 即可！

---

## 五、 开源协议

本项目采用 **MIT License** 开源。你可以自由用于个人博客搭建、二次修改与学习研究，欢迎在 GitHub 为项目点亮一个 Star ⭐️！
