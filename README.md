# 梦付千秋 · 个人博客 (AreSet's Blog)

> **落墨成格 · 像素推演 · 技术记录**  
> 基于 **Astro v6** + **React 19 Islands** + **Motion** + **Three.js** + **Nanostores** + **Tailwind CSS v4** + **GSAP** + **Lenis** 构建的高性能个人技术博客与知识工作台，深度融合清浅纸境单色水墨意境与复古像素美学。

---

## 目录

- [一、项目特色](#一项目特色)
- [二、本地运行与开发](#二本地运行与开发)
- [三、完整部署教程](#三完整部署教程)
  - [3.1 方案一：GitHub Pages 自动化静态部署（零成本·推荐）](#31-方案一github-pages-自动化静态部署零成本推荐)
  - [3.2 方案二：独立 Linux 服务器部署（阿里云 / 腾讯云 / VPS）](#32-方案二独立-linux-服务器部署阿里云--腾讯云--vps)
  - [3.3 方案三：水墨划词 AI 伴读服务端部署（feat/ink-ask 特性）](#33-方案三水墨划词-ai-伴读服务端部署featink-ask-特性)
- [四、生产环境避坑与安全规范](#四生产环境避坑与安全规范)
- [五、项目结构一览](#五项目结构一览)

---

## 一、项目特色

* **清浅纸境水墨 × 像素美学**：独创「墨化为像素」全站开屏（`SiteIntro`），支持浅宣、徽墨、青苔、米笺四套主题与 Zpix 像素 / 行云手书双字形无缝切换，统一采用单色细线 SVG 与圆润水墨胶囊视觉语言。
* **60–120fps 纯合成器动效体系**：基于 **Motion** 物理弹簧编排（`motion/react` + `workbenchMotion.ts` 反向圆角胶囊游标与 3D 宣纸折笺开合）与 **Lenis + GSAP ScrollTrigger** 协同驱动，严格规避逐帧 `filter: blur` 与同步布局回流。
* **按需分包的 `Three.js` WebGL 水墨三维能力**：
  * **`/tags` 2D/3D 双模标签星云**：支持「平面星图（2D SVG 力导向）」与「三维星云（3D WebGL 空间力导向 + 曲面水墨游丝 + 阻尼旋览调焦）」实时切换，三维坐标实时投影驱动无障碍链接节点。
  * **`ThreeDemoStage` RenderDoc 3D 渲染管线检视台**：在图形学文章（如 `renderdoc_Use`）中按需懒加载水合，支持 `Xuan-Ink Shading` / `World Normals` / `Linear Depth` / `UV Checker` / `Wireframe` 五通道实时切换与 `DrawCalls / Triangles / Vertices` 帧指标检视，普通页面零 `three` 脚本负担。
* **`Nanostores` 跨岛屿响应式状态层**：通过 `src/stores/*` 统一管理全局 `⌘K` 跨库混合命令面板（`CommandPaletteResults.tsx`）、一文多签「夹签续读」（`BookmarkPopoverList.tsx`）、禅意烟雨音景、思维导图工作台（`/mindmap`）、案头便签中心（`/notes`）以及多设备云墨增量同步（`/account`）。
* **全屏水墨飞白转场与无级缩放图表**：进入文章时呈现自研 Canvas 浓淡飞白破墨转场（`PostTransition`）；原生支持 Mermaid 图表单 `rAF` 阻尼惯性漫游、滚轮缩放与全屏检视。
* **AI 划词伴读与双卷同屏协同（`InkAsk` × `CompanionLayout`）**：在正文中划选任意文字即可勾勒书法飞白水墨笔圈，流式解析与多轮追问；由 `companionStore` 协调右侧单浮岛互切、留白画框全屏与「左墨问 · 右笔记」可拖拽并排分屏，锁定阅读列宽不重排且自动保护未存草稿。

---

## 二、本地运行与开发

### 2.1 环境要求
* **Node.js**：`>= 22.6.0`（测试套件使用原生 `--experimental-strip-types` 直接运行 TypeScript 模块）
* **包管理器**：`npm` / `pnpm`

### 2.2 快速启动
```bash
# 1. 安装项目依赖
npm install

# 2. 启动本地开发服务器（默认端口 http://localhost:4321）
npm run dev

# 3. 运行全量单元与 JSDOM 动效/契约回归测试
npm test

# 4. 生产环境构建打包
npm run build

# 5. 本地预览生产构建产物
npm run preview
```

---

## 三、完整部署教程

### 3.1 方案一：GitHub Pages 自动化静态部署（零成本·推荐）

本仓库已内置专用的 GitHub Actions 持续集成配置文件 `.github/workflows/deploy.yml`。

#### 步骤说明：
1. **确认域名配置**：
   打开项目根目录的 `astro.config.mjs`，确保 `site` 字段与你的 GitHub Pages 域名一致：
   ```javascript
   export default defineConfig({
     site: 'https://username.github.io', // 替换为你的 GitHub 账号或自定义域名
     // 若使用子路径仓库（如 username.github.io/blog），需额外配置 base: '/blog'
   });
   ```
2. **启用 GitHub Pages**：
   * 进入你的 GitHub 仓库主页，点击 **Settings** → **Pages**。
   * 在 **Build and deployment** > **Source** 下拉菜单中选择 **`GitHub Actions`**。
3. **推送代码自动触发**：
   * 只要向 `main` 分支执行 `git push`，GitHub Actions 就会自动完成构建并在几十秒内自动上线。

---

### 3.2 方案二：独立 Linux 服务器部署（阿里云 / 腾讯云 / VPS）

> [!IMPORTANT]
> **黄金法则：绝对不要在 512MB / 1GB / 2GB 的轻量服务器上直接执行 `npm run build`！**  
> Astro 静态全量构建（包含内容集合、样式转换、图片优化等）在峰值时占用约 **1.9GB** 内存，在低配服务器上构建极易直接被 Linux 内核的 OOM Killer 杀掉。  
> **最佳实践**：在自己的本地电脑完成构建，将构建产物打包同步到服务器。

#### 第一步：服务器环境准备（以 Alibaba Cloud Linux / CentOS / Ubuntu 为例）

登录你的服务器（SSH），安装 Nginx：

* **CentOS / RHEL / Alibaba Cloud Linux**：
  ```bash
  sudo dnf install -y nginx
  ```
* **Ubuntu / Debian**：
  ```bash
  sudo apt update && sudo apt install -y nginx
  ```

创建部署目录：
```bash
sudo mkdir -p /var/www/blog
```

#### 第二步：配置 Nginx 站点

在服务器上创建并编辑 Nginx 配置文件：
* **RHEL / CentOS / Alibaba Cloud Linux**：`/etc/nginx/conf.d/blog.conf`
* **Ubuntu / Debian**：`/etc/nginx/sites-available/blog`（并软链接至 `/etc/nginx/sites-enabled/`）

写入以下经过生产环境优化的静态配置：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com; # 替换为你的域名或服务器公网 IP

    root /var/www/blog;
    index index.html;
    charset utf-8;

    # Astro 静态路由适配
    location / {
        try_files $uri $uri/index.html $uri.html =404;
    }

    # 带 Hash 的静态构建资源长期强缓存，HTML 页面无缓存确保实时生效
    location /_astro/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    location ~* \.(html|json|xml)$ {
        add_header Cache-Control "no-cache";
    }

    # Gzip 压缩支持
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml text/plain;
    gzip_min_length 1024;
}
```

测试并重载 Nginx：
```bash
sudo nginx -t && sudo systemctl enable --now nginx
```

#### 第三步：本地一键构建并发布到服务器

在你的本地开发机终端中，运行以下命令（建议提前配置 SSH 公钥免密登录）：

```bash
# 1. 本地执行全量构建
npm run build

# 2. 将 dist/ 目录打包并上传解压到服务器
tar -czf blog-dist.tar.gz -C dist .
scp blog-dist.tar.gz root@YOUR_SERVER_IP:/tmp/

# 3. 远端原子替换（确保读者不会看到部署到一半的目录）
ssh root@YOUR_SERVER_IP "
  mkdir -p /var/www/blog.next && \
  tar -xzf /tmp/blog-dist.tar.gz -C /var/www/blog.next && \
  rm -rf /var/www/blog.old && \
  mv /var/www/blog /var/www/blog.old 2>/dev/null || true && \
  mv /var/www/blog.next /var/www/blog && \
  rm -rf /var/www/blog.old /tmp/blog-dist.tar.gz
"
rm blog-dist.tar.gz
```

> **自动化脚本提示**：如果你处于 `feat/ink-ask` 分支，可以直接使用封装好的跨平台 Node 脚本，一条命令全自动完成本地构建 + 归档 + SCP + 原子热替换：
> ```bash
> npm run deploy -- root@YOUR_SERVER_IP
> ```

#### 第四步：配置 HTTPS（SSL 证书）

在服务器上安装 Certbot 并一键签发 Let's Encrypt 免费证书：
```bash
# CentOS / RHEL / Alibaba Cloud Linux
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com

# Ubuntu / Debian
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

### 3.3 方案三：水墨划词 AI 伴读服务端部署（feat/ink-ask 特性）

若你启用了 `feat/ink-ask` 特性分支，可以在服务器上部署配套的原生 Node.js 伴读服务（`server/ask.mjs`）。

#### 1. 服务器建立目录与专用安全账号
```bash
sudo mkdir -p /opt/blog/server /var/lib/blog-ask
sudo useradd --system --no-create-home --shell /usr/sbin/nologin blogask
sudo chown -R blogask:blogask /var/lib/blog-ask
```

#### 2. 上传服务端脚本
在本地执行：
```bash
scp server/ask.mjs server/blog-ask.service root@YOUR_SERVER_IP:/opt/blog/server/
```

#### 3. 配置服务端密钥环境变量
在服务器上创建并严密保护配置文件 `/etc/blog-ask.env`：
```bash
sudo tee /etc/blog-ask.env >/dev/null <<'EOF'
AI_BASE_URL=https://api.openai.com/v1 # 或你的中转服务地址
AI_API_KEY=sk-xxxxxx                  # 你的大模型 API Key
AI_MODEL=gemini-2.5-flash             # 所用模型名称
ASK_SITE_DIR=/var/www/blog
ASK_CACHE_FILE=/var/lib/blog-ask/cache.json
ASK_RATE_PER_MIN=6                    # 单 IP 每分钟限制 6 次
ASK_RATE_PER_DAY=60                   # 单 IP 每天限制 60 次
ASK_DAILY_LIMIT=800                   # 全站每日总次数防刷上限
EOF

sudo chown root:root /etc/blog-ask.env
sudo chmod 600 /etc/blog-ask.env
```

#### 4. 配置 Systemd 守护进程
```bash
sudo cp /opt/blog/server/blog-ask.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blog-ask
systemctl status blog-ask
```

#### 5. 在 Nginx 中加入 `/api/ask` 反代规则
在 Nginx 配置中的 `server { ... }` 块内加入：
```nginx
    # 划词问答流式反代
    location = /api/ask {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Connection "";

        # 流式回答关键：禁用缓冲区积攒，实现逐字流式打字效果
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;

        proxy_read_timeout 180s;
        proxy_send_timeout 60s;
    }
```
重载 Nginx：`sudo nginx -s reload`。

---

## 四、生产环境避坑与安全规范

> [!WARNING]
> 若部署在 **CentOS / RHEL / Alibaba Cloud Linux** 系统上，出现 **502 Bad Gateway** 或无法访问时，请依次排查以下三项常见安全策略：

1. **SELinux 阻断 Nginx 反向代理**：
   * SELinux 默认禁止 Nginx 对外发起 TCP 连接。若使用伴读后端，需执行：
     ```bash
     sudo setsebool -P httpd_can_network_connect 1
     ```
   * 若 `/var/www/blog` 报 403 权限问题，需恢复上下文：
     ```bash
     sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/blog(/.*)?" 2>/dev/null
     sudo restorecon -Rv /var/www/blog
     ```
2. **操作系统防火墙（Firewalld / UFW）**：
   * 确保放行 80 与 443 端口：
     ```bash
     sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
     ```
3. **云厂商控制台「安全组规则」**：
   * 阿里云 / 腾讯云 / 华为云的安全组是主机外部的网络屏障，请务必在云控制台的「安全组」入方向规则中放行 **TCP 80** 与 **TCP 443** 端口，否则外部请求无法抵达主机。

---

## 五、项目结构一览

```text
├── docs/                   # 动效架构、页面交互契约与审查文档（animations-and-pages.md）
├── public/                 # 纯静态公开资源（Favicon、Robots、字体与图片等）
├── src/
│   ├── components/         # 核心可复用 Astro 组件与 React Islands
│   │   ├── islands/        # React 19 + Motion / Three.js 交互岛屿
│   │   │   ├── CommandPaletteResults.tsx # ⌘K 跨库混合检索弹簧结果列表
│   │   │   ├── BookmarkPopoverList.tsx   # 一文多签「本文夹签」弹簧浮笺
│   │   │   └── ThreeDemoStage.tsx        # RenderDoc 3D 渲染管线 5 通道检视台
│   │   ├── SiteIntro.astro # 全站「墨化为像素」开屏幕
│   │   ├── Header.astro    # 侧栏磁吸毛笔游标、主题水墨晕环与禅意音景开关
│   │   ├── PostTransition  # 文章全屏双层飞白破墨转场
│   │   ├── ThreeInkCanvas  # 宣纸毛细渗化与水墨涟漪 WebGL 画布组件
│   │   ├── MermaidRenderer # Mermaid 图表渲染、阻尼惯性漫游与无级缩放
│   │   ├── CompanionLayout # 墨问 × 笔记 空间协调器（单浮岛 / 全屏 / 双卷并排）
│   │   └── InkAsk.astro    # 书法飞白墨圈 AI 伴读面板（feat/ink-ask）
│   ├── stores/             # Nanostores 跨组件响应式状态层（shell / palette / reading / zen / sync / notes / mindmap / collection / companion）
│   ├── content/posts/      # 博客 Markdown 文章源文件
│   ├── layouts/            # 页面骨架布局（BaseLayout、PostLayout）
│   ├── pages/              # 路由视图（首页、归档、2D/3D 标签星云、导图、便签、画廊、生活、设置、账户等）
│   ├── utils/              # 纯逻辑与动效引擎（workbenchMotion、threeInkStage、tagConstellationThree、mindmapEngine 等）
│   └── styles/global.css   # 全局样式系统与四套单色水墨纸境主题令牌
├── tests/                  # 全站自动化单元、JSDOM 交互与单色水墨/合成器性能守门测试套件
├── scripts/                # 构建、散列与自动化部署脚本
├── server/                 # 独立伴读与多端同步后端及运维配置模板
├── astro.config.mjs        # Astro v6 + React 集成与构建清单配置
└── package.json            # 项目依赖与指令定义
```
