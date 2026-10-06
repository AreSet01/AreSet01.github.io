import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const PORT = 4210;
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PREVIEWS_DIR = path.resolve('public/previews');

if (!fs.existsSync(PREVIEWS_DIR)) {
  fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
}

const SHADES = [
  { id: '004D40', name: 'Teal 900 (松石极墨)', hex: '#004D40', contrast: '8.96:1 (AAA)', note: '深沉如墨松，对比度极高，偏厚重' },
  { id: '00695C', name: 'Teal 800 (竹青墨韵)', hex: '#00695C', contrast: '6.03:1 (AA)', note: '浓郁雅致，青翠如竹，兼顾护眼与辨识' },
  { id: '00796B', name: 'Teal 700 (翡翠青玉 · 推荐)', hex: '#00796B', contrast: '4.85:1 (AA)', note: '透亮青润，摆脱原版浑浊感与深暗感，粉墨相映极佳' },
  { id: '00897B', name: 'Teal 600 (碧波苍青)', hex: '#00897B', contrast: '3.93:1', note: '明亮通透，青意盎然，大字辨识度高' },
  { id: '4DB6AC', name: 'Teal 300 (清凉薄荷)', hex: '#4DB6AC', contrast: '2.23:1 (适配深墨)', note: '清爽明亮浅底，需配合深黛墨字呈现' },
];

function captureScreenshot(url, outPath, width = 1200, height = 750) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(outPath)) {
      try { fs.unlinkSync(outPath); } catch (e) {}
    }
    const profile = `/tmp/chrome-prof-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const args = [
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      `--screenshot=${outPath}`,
      '--no-first-run',
      '--force-prefers-reduced-motion',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--hide-scrollbars',
      url
    ];
    const proc = spawn(CHROME_PATH, args, { stdio: 'ignore' });

    const checkTimer = setInterval(() => {
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
        clearInterval(checkTimer);
        clearTimeout(timeoutTimer);
        proc.kill('SIGKILL');
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
        resolve();
      }
    }, 150);

    const timeoutTimer = setTimeout(() => {
      clearInterval(checkTimer);
      proc.kill('SIGKILL');
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) resolve();
      else reject(new Error('Screenshot timeout for ' + url));
    }, 6000);
  });
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = urlObj.pathname;
  if (pathname === '/') pathname = '/index.html';
  let filePath = path.join('dist', pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
  }[ext] || 'application/octet-stream';

  if (ext === '.html') {
    let html = fs.readFileSync(filePath, 'utf8');
    html = html.replace(/<link[^>]*googleapis[^>]*>/gi, '');
    html = html.replace(/<link[^>]*jsdelivr[^>]*>/gi, '');

    const shade = urlObj.searchParams.get('shade');
    const theme = urlObj.searchParams.get('theme') || (shade ? 'moss' : 'moss');
    const hoverSim = urlObj.searchParams.get('hoverSim');

    // Fully disable the intro curtain overlay and animation blocking
    html = html.replace(/document\.documentElement\.classList\.add\('site-intro-active'\);/g, '');
    html = html.replace(/document\.documentElement\.classList\.add\('js-enter'\);/g, '');
    html = html.replace(/sessionStorage\.getItem\('site-intro-seen'\) === '1'/g, 'true');

    // Force explicit theme & shade in layout script so it cannot fall back to dark OS theme
    html = html.replace(/<html([^>]*)>/, `<html$1 data-theme="${theme}"${shade ? ` data-moss-shade="${shade}"` : ''}>`);
    html = html.replace(/var storedTheme = getStoredTheme\(\);/g, `var storedTheme = '${theme}';`);
    html = html.replace(/resolveTheme\(explicitTheme\)/g, `'${theme}'`);

    let extraStyles = `
      .site-intro, [data-site-intro] { display: none !important; opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }
      html.site-intro-active { overflow: auto !important; }
      #inkCanvas, .zen-rainscape, .zen-rain-toggle-pill { display: none !important; }
      [data-enter], html.js-enter [data-enter]:not(.is-entered) {
        opacity: 1 !important;
        visibility: visible !important;
        transform: none !important;
        animation: none !important;
        transition: none !important;
      }
    `;

    if (hoverSim === 'archive') {
      extraStyles += `
        .archive-filter.is-active {
          color: var(--bg-base) !important;
          border-color: var(--ink-strong) !important;
          transform: translateY(-1px) !important;
        }
        .archive-filter:not(.is-active):first-of-type {
          border-color: var(--accent) !important;
          color: var(--text-strong) !important;
          transform: translateY(-1px) !important;
        }
      `;
    }

    if (hoverSim === 'life') {
      extraStyles += `
        .life-cat-tab.is-active {
          color: var(--bg-base) !important;
          border-color: var(--ink-strong) !important;
          transform: translateY(-1px) !important;
        }
        .life-cat-tab:not(.is-active):first-of-type {
          border-color: var(--accent) !important;
          color: var(--text-strong) !important;
          transform: translateY(-1px) !important;
        }
        .life-cat-tab.is-active .cat-count {
          color: inherit !important;
        }
      `;
    }

    const injectHead = `
      <style>${extraStyles}</style>
      <script>
        try {
          sessionStorage.setItem('site-intro-seen', '1');
          localStorage.setItem('theme', '${theme}');
        } catch(e){}
        window.__siteIntroPending = false;
        window.__postTransitionPending = false;
      </script>
    `;

    html = html.replace('</head>', `${injectHead}</head>`);
    html = html.replace('</body>', `
      <script>
        document.querySelectorAll('[data-enter]').forEach(function(el) {
          el.classList.add('is-entered');
        });
      </script>
    </body>`);

    res.writeHead(200, { 'Content-Type': mime });
    res.end(html);
  } else {
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  }
});

server.listen(PORT, async () => {
  console.log(`Preview server listening on port ${PORT}...`);

  try {
    const shadeImages = [];
    for (let i = 0; i < SHADES.length; i++) {
      const s = SHADES[i];
      const outName = `shade_${i + 1}_${s.id}.png`;
      const outPath = path.join(PREVIEWS_DIR, outName);
      const url = `http://localhost:${PORT}/archive/?shade=${s.id}`;
      console.log(`Capturing shade ${s.id} (${s.name})...`);

      await captureScreenshot(url, outPath, 1200, 750);
      shadeImages.push(outPath);
      console.log(`✓ Saved ${outName}`);
    }

    console.log('Capturing archive hover verification...');
    const archiveHoverPath = path.join(PREVIEWS_DIR, 'hover_archive_active.png');
    await captureScreenshot(`http://localhost:${PORT}/archive/?shade=00796B&hoverSim=archive`, archiveHoverPath, 1200, 750);
    console.log('✓ Saved hover_archive_active.png');

    console.log('Capturing life hover verification...');
    const lifeHoverPath = path.join(PREVIEWS_DIR, 'hover_life_active.png');
    await captureScreenshot(`http://localhost:${PORT}/life/?shade=00796B&hoverSim=life`, lifeHoverPath, 1200, 750);
    console.log('✓ Saved hover_life_active.png');

    console.log('Capturing dark theme archive hover verification...');
    const darkArchiveHoverPath = path.join(PREVIEWS_DIR, 'hover_dark_archive.png');
    await captureScreenshot(`http://localhost:${PORT}/archive/?theme=dark&hoverSim=archive`, darkArchiveHoverPath, 1200, 750);
    console.log('✓ Saved hover_dark_archive.png');

    console.log('Generating composite comparison infographic with sharp...');
    const cardWidth = 360;
    const cardHeight = 225;
    const padding = 24;
    const bannerHeight = 85;
    const totalWidth = cardWidth * 5 + padding * 6;
    const totalHeight = bannerHeight + cardHeight + 175;

    const thumbs = await Promise.all(
      shadeImages.map(img => sharp(img).resize(cardWidth, cardHeight, { fit: 'cover', position: 'top' }).toBuffer())
    );

    let svgElements = '';
    for (let i = 0; i < SHADES.length; i++) {
      const s = SHADES[i];
      const x = padding + i * (cardWidth + padding);
      const yThumb = bannerHeight + padding;
      const yInfo = yThumb + cardHeight + 14;
      const isRec = s.id === '00796B';

      svgElements += `
        <rect x="${x - 4}" y="${yThumb - 4}" width="${cardWidth + 8}" height="${cardHeight + 8}" rx="10" fill="none" stroke="${isRec ? '#FFC2D1' : 'rgba(255,255,255,0.22)'}" stroke-width="${isRec ? '3.5' : '1.5'}" />
        ${isRec ? `<rect x="${x + 8}" y="${yThumb + 8}" width="96" height="24" rx="4" fill="#FFC2D1" /><text x="${x + 56}" y="${yThumb + 24}" fill="#004D40" font-size="12" font-weight="bold" font-family="-apple-system, sans-serif" text-anchor="middle">★ 最佳推荐</text>` : ''}
        
        <rect x="${x}" y="${yInfo}" width="28" height="28" rx="6" fill="${s.hex}" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
        <text x="${x + 36}" y="${yInfo + 15}" fill="#ffffff" font-size="15" font-weight="bold" font-family="-apple-system, sans-serif">${s.hex}</text>
        <text x="${x + 36}" y="${yInfo + 30}" fill="#FFD3DE" font-size="12" font-family="-apple-system, sans-serif">${s.name}</text>
        
        <rect x="${x}" y="${yInfo + 42}" width="${cardWidth}" height="52" rx="6" fill="rgba(0,0,0,0.4)" />
        <text x="${x + 12}" y="${yInfo + 62}" fill="#FFF1F4" font-size="12" font-weight="bold" font-family="-apple-system, sans-serif">WCAG 对比度: ${s.contrast}</text>
        <text x="${x + 12}" y="${yInfo + 82}" fill="#D8B2BC" font-size="11" font-family="-apple-system, sans-serif">${s.note}</text>
      `;
    }

    const bannerSvg = `
      <svg width="${totalWidth}" height="${totalHeight}">
        <rect width="${totalWidth}" height="${totalHeight}" fill="#091714" />
        <text x="${totalWidth / 2}" y="42" fill="#FFF1F4" font-size="24" font-weight="bold" font-family="-apple-system, sans-serif" text-anchor="middle">绿粉主题 5 款候选绿色全景效果实测对比</text>
        <text x="${totalWidth / 2}" y="68" fill="#D8B2BC" font-size="13" font-family="-apple-system, sans-serif" text-anchor="middle">对比基准：粉色文字 (#FFF1F4) · 原版 #62A06F 对比度仅 2.82:1 (不及格) · 推荐 #00796B 翡翠青玉 (透亮青润/通过WCAG AA)</text>
        ${svgElements}
      </svg>
    `;

    const compositeList = [
      { input: Buffer.from(bannerSvg), top: 0, left: 0 }
    ];

    for (let i = 0; i < thumbs.length; i++) {
      const x = padding + i * (cardWidth + padding);
      const yThumb = bannerHeight + padding;
      compositeList.push({ input: thumbs[i], top: yThumb, left: x });
    }

    const comparisonPath = path.join(PREVIEWS_DIR, 'theme_color_comparison.png');
    await sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: '#091714'
      }
    })
    .composite(compositeList)
    .png()
    .toFile(comparisonPath);

    console.log('=== All Preview Screenshots Ready ===');
    console.log(`Infographic: ${comparisonPath}`);
  } catch (err) {
    console.error('Error during generation:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
