# 划词问答 · 部署说明

读者在文章里选中一段文字 → 选区末尾钤出一枚「问」印 → 一笔墨圈把它圈起来 → 卡片里流式写出 AI 的解释，可以再追问。

**key 只存在服务器上**。前端只发「哪篇文章 + 选中的文字」，模型、提示词、温度全由服务端决定。

```
浏览器  ──POST /api/ask──▶  nginx  ──▶  127.0.0.1:8787 (server/ask.mjs)  ──▶  OpenAI 兼容接口
                                    ▲
                         读 dist/posts/**/index.html 核对选区、截取上下文
```

---

## 一、这台机器上要装什么

只要 **nginx** 和 **Node ≥ 20.12**，不用装 `node_modules`：服务是零依赖的单个文件。

**Alibaba Cloud Linux / CentOS / RHEL**（本项目实际部署的机器就是 Alibaba Cloud Linux 3）：

```bash
sudo dnf install -y nginx
node -v          # Alibaba Cloud Linux 3 自带 v20.20.2，够用
# 万一没有：sudo dnf module install -y nodejs:20
```

**Ubuntu / Debian**：

```bash
sudo apt update && sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

**不要在服务器上 `npm run build`。** 实测构建峰值约 1.9GB 内存（34 页 / 54 秒），会被 OOM 杀掉。构建在你自己的电脑上完成，只把 `dist/` 传上去（见第七节）。

## 二、放文件

```bash
# 服务器上：建目录
sudo mkdir -p /opt/blog/server /var/www/blog /var/lib/blog-ask

# 本机执行：把服务端脚本和三份配置传上去（只传这一次，之后 npm run deploy 会自动更新 ask.mjs）
cd 你的博客目录
scp server/ask.mjs server/blog-ask.service server/nginx.conf.example root@SERVER:/opt/blog/server/
```

站点文件不用手工传——`npm run deploy`（见第七节）会把构建产物放到 `/var/www/blog`。

`server/` 目录里只有 `ask.mjs` 会被运行，其余（nginx 示例、systemd 单元、本说明）是给人看的。

## 三、配置 key

```bash
sudo tee /etc/blog-ask.env >/dev/null <<'EOF'
AI_BASE_URL=https://fuhuagoogle.top/v1
AI_API_KEY=在这里填你的key
AI_MODEL=gemini-3.8-flash-high
ASK_SITE_DIR=/var/www/blog
ASK_CACHE_FILE=/var/lib/blog-ask/cache.json
ASK_RATE_PER_MIN=6
ASK_RATE_PER_DAY=60
ASK_DAILY_LIMIT=800
EOF
sudo chown root:root /etc/blog-ask.env && sudo chmod 600 /etc/blog-ask.env
```

全部可调项见 [ask.env.example](ask.env.example)，几个关键的：

| 变量 | 作用 | 建议 |
|---|---|---|
| `AI_MAX_TOKENS` | 单次回答上限 | 思考型模型的思考也计入，回答老被截断就调大 |
| `ASK_DAILY_LIMIT` | 全站每天调用模型的总次数 | 这是**花钱的闸门**，按预算设 |
| `ASK_RATE_PER_MIN` / `ASK_RATE_PER_DAY` | 每个 IP 的限流 | 防一个人刷 |
| `ASK_MAX_CONCURRENT` | 同时进行中的回答数 | 每个回答约 1–3MB 内存，12 足够 |

## 四、建账号、起服务

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin blogask
sudo chown -R blogask:blogask /var/lib/blog-ask
sudo cp /opt/blog/server/blog-ask.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now blog-ask
systemctl status blog-ask --no-pager
curl -s localhost:8787/api/ask      # {"ok":true}
```

```bash
systemctl restart blog-ask
```

看日志：`journalctl -u blog-ask -f`，每次问答都有一行结果（`ok` / `cache` / `fail` / `client-closed`）和耗时。

## 五、nginx

**Alibaba Cloud Linux / CentOS / RHEL**（没有 sites-available 那一套，直接放 `conf.d`）：

```bash
sudo cp /opt/blog/server/nginx.conf.example /etc/nginx/conf.d/blog.conf
sudo nano /etc/nginx/conf.d/blog.conf          # 改 server_name、root、证书路径
sudo nginx -t && sudo systemctl enable --now nginx
```

**Ubuntu / Debian**：

```bash
sudo cp /opt/blog/server/nginx.conf.example /etc/nginx/sites-available/blog
sudo nano /etc/nginx/sites-available/blog
sudo ln -s /etc/nginx/sites-available/blog /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl enable --now nginx
```

证书用 certbot：`sudo dnf install -y certbot python3-certbot-nginx && sudo certbot --nginx -d 你的域名`（Debian 系用 `apt install certbot python3-certbot-nginx`），它会自己改好那两处 ssl 路径。

**流式回答必须 `proxy_buffering off`**（示例里已写）。少了这一行，nginx 会把整个回答攒完才一次发给读者，效果就是「转半天圈然后整段蹦出来」。

**RHEL 系还要处理三件事**（Alibaba Cloud Linux 3 默认都开着，漏了会表现为 **502**）：

```bash
# 1. SELinux 默认不许 nginx 往外连，反代到 8787 会被拒
getenforce                                   # Enforcing 就要下面这行
sudo setsebool -P httpd_can_network_connect 1

# 2. 站点文件在 /var/www，SELinux 可能不认识这个位置
sudo semanage fcontext -a -t httpd_sys_content_t "/var/www/blog(/.*)?" 2>/dev/null
sudo restorecon -Rv /var/www/blog

# 3. firewalld 放行 80 / 443
sudo firewall-cmd --permanent --add-service=http --add-service=https && sudo firewall-cmd --reload
```

**别忘了阿里云控制台的「安全组」**：那是服务器外面的另一层，80/443 不开的话本机怎么配都没用（控制台 → 实例 → 安全组 → 入方向加 80/443）。

## 六、域名与备案

服务器在中国大陆、要用域名访问的话，先做 ICP 备案；直接用 IP 访问不用。香港 / 海外地域不需要备案。`astro.config.mjs` 里的 `site` 记得改成新域名（评论是按下标匹配的，换域名不会丢评论）。

## 七、以后怎么更新

**推荐：在你自己电脑上构建，把产物传上去**（用不着 GitHub Actions）：

```bash
npm run deploy -- root@你的服务器IP
```

脚本 `scripts/deploy-server.mjs` 做五件事：本地构建 → 打包 `dist/` → `scp` 上传 → 服务器上解到旁边的目录再两次 `mv` 交换（nginx 不会看到解到一半的站点）→ 比对 `ask.mjs`，变了才重启服务。

用 Node 写而不是 bash：Windows 的 PowerShell 里 `bash` 会解析到 WSL 的 bash（没装发行版就报 `/bin/bash not found`），而 `node` 在 PowerShell / cmd / Git Bash 里都是同一个。

加 `--dry-run` 可以只构建打包、打印将要执行的命令而不动服务器。服务器地址也可以走环境变量（`BLOG_SERVER=root@ip npm run deploy`），路径用 `BLOG_SITE_DIR` / `BLOG_APP_DIR` 覆盖。

**为什么不要让服务器自己构建**：`astro build` 峰值约 1.9GB 内存，500MB 的机器会被 OOM 杀掉。

<details>
<summary>想改成 GitHub Actions 自动部署（可选）</summary>

把下面这段加到 `.github/workflows/` 里，构建跑在 GitHub 上，服务器只收产物（secrets 里配 `SSH_KEY`、`HOST`）：

```yaml
  deploy-server:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with: { name: dist, path: dist }   # 或继续用 withastro/action 的产物
      - run: |
          install -m 600 -D /dev/stdin ~/.ssh/id_ed25519 <<< "${{ secrets.SSH_KEY }}"
          rsync -avz --delete -e "ssh -o StrictHostKeyChecking=accept-new" dist/ \
            root@${{ secrets.HOST }}:/var/www/blog/
```

GitHub 的 runner 是 Linux，自带 rsync；你本机是 Windows + Git Bash，**没有 rsync**，所以本地部署走的是上面的脚本。

> 两个一起跑也可以：你现在用着 GitHub Pages 的 `deploy.yml`，同一份 `dist` 同时发到 Pages 和服务器。
</details>

## 八、本地调试

```bash
cp server/ask.env.example server/ask.env   # 填 key；这个文件不会被提交
npm run ask                                # 起在 127.0.0.1:8787
npm run dev                                # astro dev 已经把 /api 代理到 8787
```

## 九、它挡得住什么

开放给所有读者用，`/api/ask` 就等于一个用你的 key 付费的接口，所以服务端做了这些：

- **只能问文章里真实存在的文字**：服务端把选区拿到 `dist` 里对应那篇的正文中查找，找不到就 422。没法当通用聊天机器人用。
- **前端只能传选区和一句追问**：模型、系统提示词、`max_tokens` 都在服务端，追问 ≤120 字。
- **要求 `Content-Type: application/json`**：别的网站没法用「简单请求」让读者的浏览器替它刷这个接口。
- **限流**：每 IP 每分钟 / 每天 + 全站每日总次数 + 并发上限。缓存命中的重复提问不计数、不花钱。
- **答案缓存**：同一篇、同一处、同一个问题直接复用，写盘保存，重启不丢。

想更严一点：给 `location = /api/ask` 加一条 `limit_req`（nginx 层再挡一道），或者把 `ASK_DAILY_LIMIT` 调小。
