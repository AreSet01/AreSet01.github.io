#!/usr/bin/env node
// 本地构建 → 打包 → 传到服务器。替代 GitHub Actions，适合「构建在我电脑上，产物扔给服务器」。
//
//   npm run deploy -- root@你的服务器IP
//   npm run deploy -- root@你的服务器IP --dry-run    # 只构建打包，不上传
//
// 也可以走环境变量（BLOG_SERVER=root@ip npm run deploy），命令行参数优先。
// 可选环境变量：
//   BLOG_SITE_DIR   服务器上的站点目录（默认 /var/www/blog）
//   BLOG_APP_DIR    服务器上的服务目录（默认 /opt/blog/server）
//   BLOG_REMOTE_TMP 服务器上的临时目录（默认 /tmp）
//
// 用 Node 而不是 bash 写：Windows 的 PowerShell 里 `bash` 会解析到 WSL 的 bash（没装发行版就报
// /bin/bash not found），而 `node` 在 PowerShell / cmd / Git Bash 里都是同一个。
//
// 前提：能 ssh 上去（建议先配好免密：Git Bash 里 ssh-copy-id，或 PowerShell 里 cat 公钥 | ssh）；
//      服务器上 nginx 与 blog-ask 已按 server/README.md 装好。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const unknown = argv.find((a) => a.startsWith('-') && a !== '--dry-run');
if (unknown) {
  console.error(`未知参数：${unknown}`);
  process.exit(1);
}
const server = argv.find((a) => !a.startsWith('-')) || process.env.BLOG_SERVER || '';
if (!server) {
  console.error('用法：npm run deploy -- root@你的服务器IP');
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, '..');
const siteDir = process.env.BLOG_SITE_DIR || '/var/www/blog';
const appDir = process.env.BLOG_APP_DIR || '/opt/blog/server';
const remoteTmp = process.env.BLOG_REMOTE_TMP || '/tmp';
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
const archive = `blog-dist-${stamp}.tar.gz`;
// 归档放在仓库目录下、用相对路径传给 tar：GNU tar 会把 "C:\..." 当成远程主机名（host:path 语法）
// 去连，所以参数里绝不能出现盘符。文件在结束时会删掉，也已加进 .gitignore。
const localArchive = path.join(root, archive);
// Windows 上 rmSync(..., {force:true}) 出现过「不删也不报错」，unlinkSync 一直可靠
const cleanArchive = () => {
  try {
    unlinkSync(localArchive);
  } catch {
    // 没生成或已被删掉，都无所谓
  }
};
// 上次被 Ctrl+C 打断的话会留下归档，顺手清干净（只认这个命名，且只在仓库根目录）
const cleanStaleArchives = () => {
  for (const name of readdirSync(root)) {
    if (/^blog-dist-\d{14}\.tar\.gz$/.test(name)) {
      try {
        unlinkSync(path.join(root, name));
      } catch {}
    }
  }
};

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', ...opts });
function run(cmd, args, what, opts = {}) {
  const result = sh(cmd, args, opts);
  if (result.error) throw new Error(`${what} 起不来：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${what} 失败（退出码 ${result.status}）`);
}

try {
  console.log('==> 1/5 构建（本地跑，峰值约 1.9GB 内存，服务器不参与）');
  // 直接跑 Astro 的 CLI，不经过 npm：Windows 上 npm 是 .cmd，Node 18.20.2+ 禁止直接 spawn（EINVAL），
  // 而 process.execPath 是同一个 node，到处都能用。入口从 astro 自己的 package.json 里读。
  const astroEntry = JSON.parse(readFileSync(path.join(root, 'node_modules/astro/package.json'), 'utf8')).bin.astro;
  run(process.execPath, [path.join(root, 'node_modules/astro', astroEntry), 'build', '--force'], 'astro build');

  console.log(`==> 2/5 打包 dist/（${archive}）`);
  cleanStaleArchives();
  run('tar', ['-czf', archive, '-C', 'dist', '.'], 'tar', { cwd: root });

  console.log(`==> 3/5 上传到 ${server}:${remoteTmp}`);
  if (dryRun) console.log(`    [dry-run] scp ${localArchive} ${server}:${remoteTmp}/`);
  else run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', localArchive, `${server}:${remoteTmp}/`], 'scp');

  // 先解到旁边，再两次 mv 交换：nginx 不会看到解到一半的目录。
  // Debian 系是 www-data，RHEL 系（含 Alibaba Cloud Linux）是 nginx；都不在也无所谓，
  // tar 保留的 644/755 本来就够 nginx 读。
  const swap = `set -e
mkdir -p '${siteDir}' '${siteDir}.next'
rm -rf '${siteDir}.next'/* '${siteDir}.next'/.[!.]* 2>/dev/null || true
tar -xzf '${remoteTmp}/${archive}' -C '${siteDir}.next'
chown -R www-data:www-data '${siteDir}.next' 2>/dev/null || chown -R nginx:nginx '${siteDir}.next' 2>/dev/null || true
rm -rf '${siteDir}.old'
mv '${siteDir}' '${siteDir}.old'
mv '${siteDir}.next' '${siteDir}'
rm -rf '${siteDir}.old' '${remoteTmp}/${archive}'
echo "   站点已更新：$(find '${siteDir}' -name index.html | wc -l) 个页面"`;
  console.log(`==> 4/5 解包并原子替换 ${siteDir}`);
  if (dryRun) console.log(`    [dry-run] ssh ${server} "${swap.split('\n')[0]} …"`);
  else run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', server, swap], '远端解包');

  console.log('==> 5/5 同步服务端脚本（只有变了才重启）');
  if (dryRun) {
    console.log(`    [dry-run] 会比对 ${appDir}/ask.mjs 并可能重启 blog-ask`);
  } else {
    const local = createHash('sha1').update(readFileSync(path.join(root, 'server/ask.mjs'))).digest('hex');
    const probe = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', server, `sha1sum '${appDir}/ask.mjs' | cut -d' ' -f1`], { encoding: 'utf8' });
    const remote = (probe.stdout || '').trim();
    if (local && local === remote) {
      console.log('    ask.mjs 没变，不重启');
    } else {
      run('scp', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', path.join(root, 'server/ask.mjs'), `${server}:${remoteTmp}/ask.mjs`], 'scp ask.mjs');
      run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', server, `mv '${remoteTmp}/ask.mjs' '${appDir}/ask.mjs' && systemctl restart blog-ask && systemctl is-active blog-ask`], '重启 blog-ask');
      console.log('    ask.mjs 已更新，服务已重启');
    }
  }

  console.log(`完成。看看线上：curl -s http://${server.split('@').pop()}/api/ask`);
} catch (error) {
  console.error(`\n中断：${error.message}`);
  process.exitCode = 1;
} finally {
  cleanArchive();
}
