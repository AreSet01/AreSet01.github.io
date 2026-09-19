# 动效系统与页面说明

> 记录本次改造后的结构、可调参数，以及尚未完成的部分。
> 最后更新：2026-09-19

---

## 一、这次做了什么

### 新增页面

| 路由 | 说明 |
|---|---|
| `/timeline` | 年轮。竖向滚动被 pin 住转成横向手卷，可拖拽；每个墨点是一篇文章，靠近时卡片像墨一样渗出来 |
| `/tags` | 标签星图。力导向布局，字号=文章数，连线=共现次数，悬停点亮一个标签的星座 |
| `/tags/[tag]` | 标签详情。列表用墨点渗开逐条刷出，顶部列出共现最多的兄弟标签 |
| `/stats` | 写作统计。hero 数字 + KPI + 四张图（发文节奏、每篇体量、累计字数、标签分布）+ 数据表（`<details>`，开合由脚本接管：盒子按 `enter` 缓动撑开/收拢，行从左渗入级联，三角标记旋转；结束后 `refresh()` + `lenis.resize()`） |

导航栏现在是：`Main*` / `All Doc` / `Timeline` / `Tags` / `Stats` / `About Me`。

### 新增功能

**系列导航** —— frontmatter 加 `series` 与 `seriesOrder`，文章页自动生成顶部墨点进度条（悬停出标题）和底部上/下篇卡片。已配置两个系列：UE5 Meta 七篇（含导读）、RenderDoc 两篇。

**分类筛选** —— frontmatter 加 `category`（每篇手填，刻意比 tags 粗）。All Doc 顶部出现筛选 chips；文章页的 meta 行可点进对应分类，链接形如 `/archive?category=引擎开发`。切换动效见 2.3。

**站点进场幕** —— 每个浏览器会话第一次打开任意页面时播一段 10s 的开场「墨化为像素」（`src/components/SiteIntro.astro`），可跳过。见 2.4。About 页原来的像素开场已退役，由它接管。

**代码块增强** —— Astro 的 Shiki transformer（`astro.config.mjs`）解析围栏元信息：

````
```cpp title="MyActor.h" {3-5}
```
````

- `title="..."` → 工具栏左侧显示文件名（原本只显示语言名）
- `{3-5,8}` → 这几行高亮，其余行淡到 40%，鼠标移上去恢复全亮
- 行数 ≥ 5 自动加行号，`no-line-numbers` 可关

**页面进场重播** —— 见下一节。

**首页三个彩蛋** —— 长按标题让字掉到跑马灯上；三连点右下印章展开「愤青（bushi）言论」；`↑↑↓↓←→←→BA` 切换像素/CRT 模式（localStorage 持久化）。

**绿粉主题** —— 主题循环 浅 → 深 → 绿粉，绿底 `#62A06F`。

---

## 二、动效架构

### 2.1 页面进场（`src/layouts/BaseLayout.astro`）

页面上任何带 `data-enter="<kind>"` 的元素都会被编排进场。

**kind 取值**

| kind | 动作 |
|---|---|
| `left` / `right` / `top` / `bottom` | 从对应方向位移进入 |
| `scale` | 缩小进入 |
| `stamp` | 钤印砸落（scale 1.7 + 旋转过冲），落点炸墨点，内部 `[data-count]` 数字同步 count-up |
| `ink` | 从行首日期的位置以圆形 clip-path 渗开整行 |

**两套触发**

- 首屏元素（`rect.top < 视口高 * 0.92`）走一条交错时间线，按方向分组：先左右、再上下、最后 stamp/ink，组间有 0.08s 停顿。
- 其余元素注册两个 ScrollTrigger：
  - `enter:in-N` —— 进入视口一定深度时**播放**
  - `enter:out-N` —— 完全离开视口时**静默重置**并重新武装

阈值不对称是有意的：播放在"刚进来一点"，重置要等到"完全出去"。两者如果都用同一条线，任何微小的布局抖动都会让元素反复重播。

**首次播放 vs 重播的方向**

首次播放用作者写死的方向；重播时垂直分量跟随滚动方向（向下滚则从下往上进，向上滚则从上往下落），所以动作永远和"它从哪儿来"一致。滚动方向由 `html[data-scroll-dir]` 承载，文章正文的 CSS 也读这个属性。

**逃生舱**

| 属性 | 作用 |
|---|---|
| `data-enter-once` | 只在硬加载时进场一次（侧边栏用） |
| `data-no-replay` | 永不重播（pin 内部元素用，见下） |
| `data-enter-hold` | 挂起整页进场，等 `window.__releasePageEnter()`（目前没有页面在用；站点进场幕走 `window.__siteIntroPending`，效果相同，放行时可传 `{ timeScale }` 压缩交错） |
| `data-enter-state` | 运行时状态：`in` / `out`，其他脚本判断"动画有没有在管这个元素" |

挂起有一个 14s 的保险：开场脚本若出错没能调用 release，页面也会自己放行，不会永远空白（进场幕本身在 8.5s 放行，保险必须晚于它）。

`window.__peekPageEnter()` 返回首屏进场计划 `[{ el, at, kind }]` 而不播放——进场幕靠它把像素安排到每个元素开始进场的那一刻。

**为什么 pin 内部要 `data-no-replay`**：时间轴页的 stage 被 ScrollTrigger pin 住，pin spacer 会改变触发器的坐标；元素如果会重播，坐标算错就会误触发。

**触发器只量一次，页面长高要告诉它**：触发器的 start/end 在 `refresh()` 时测量。一个 `[data-enter]` 元素如果事后长高了（统计页的「数据表」`<details>` 打开后从 1 屏变 3 屏），"完全离开视口 → 隐藏"的那条触发器还按旧高度算，往下读到旧的 end 就会把整块**在屏幕上**的表格藏掉——这就是曾经的"一大片空白"。现在有两道保险：`leaveEnter()` 会先看元素是否真的在视口外，还在就改为 `refresh()` 而不是隐藏；`BaseLayout` 在 capture 阶段监听全局 `toggle` 事件，任何 `<details>` 开合都会在下一帧 `refresh()`。自己写会改页高的东西（展开面板、加载更多）结束时也要调 `ScrollTrigger.refresh()` + `lenis.resize()`。

### 2.2 文章正文（`src/layouts/PostLayout.astro`）

正文的每个直接子元素在运行时打上 `.pr` 和 `data-pr="<kind>"`，由 IntersectionObserver 切换 `.is-in`，动作全部走 CSS transition（不占 rAF）：

| kind | 动作 |
|---|---|
| `block` | 上浮淡入（向上滚时改为从上方落下，见 `html[data-scroll-dir="up"]` 规则） |
| `heading`（h2） | 顶部分割线从左画出，标题字晚 160ms 跟上 |
| `subheading` | 从左滑入 |
| `code` | 自上而下 clip-path 擦出，一根扫描线领着 |
| `image` | 从中心圆形渗开，图本身 1.05 → 1 |
| `table` / `list` | 行/项级联 |
| `quote` | 大引号先带过冲落下 |

代码块和图片额外包了一层 `.pr-wrap`——Chrome 的 IntersectionObserver 会把元素自身的 `clip-path` 当作裁剪区，`circle(0)` 的元素永远判定为不可见。

标题逐字落下、日期打字机、左缘阅读脊线（随滚动画出 + h2 处生墨点）也在这个文件里。

### 2.3 归档分类切换（`src/pages/archive.astro`）

早先的版本是"先 `display:none` 再 FLIP 补位"，幸存行瞬移之后再滑回去，跟全站"墨渗开"的调性不搭。现在是一条 GSAP 时间线，全程只动 `height` / `clip-path` / `opacity`：

| 阶段 | 动作 |
|---|---|
| 离开的行 | 墨从行首日期处**收干**（`clip-path` 圆缩到 0，和 `data-enter="ink"` 的进场正好相反），同时行高塌到 0，后面的行被连续地带上来 |
| 整年清空 | 该年的 section 作为一个整块塌陷（高度 + 上下 margin + 淡出），里面的行只收墨不塌高 |
| 回来的行 | 先把盒子撑开（高度 0 → 实高），墨再从日期处渗开；从 0.3s 起和离开的尾巴重叠 |
| 整年回来 | section 先撑开，行再往里渗 |
| 年份计数 | `n entries` 数字随之滚动 |
| 筛选 chip | 选中态的墨色从左往右灌满（`::before` 的 `scaleX`），不再是 background 瞬变 |

要点：

- 回来的行会在同一个任务里先被"打开 → 量高 → 折回 0"，浏览器不会画出中间态。
- 高度用 `getBoundingClientRect().height`，不用 `offsetHeight`：后者取整，9 行累加会让列表肉眼可见地长高 2–3px。
- Tailwind 的 `space-y-16` 把间距放在 `margin-bottom`，所以塌陷整年时上下 margin 都要一起动。
- 动画中途再点一次 chip：先杀掉旧时间线并把所有行/section 的内联样式清干净，再按 class 重新读现状规划。
- 结束时 `ScrollTrigger.refresh()` + `lenis.resize()`，深链接和 `prefers-reduced-motion` 走无动画分支。

### 2.4 站点进场幕（`src/components/SiteIntro.astro`）

「墨化为像素」，10s，每个浏览器会话首次打开任意页面时播一次，随时可跳过。全程只有一张 canvas 在动，DOM 只承担印章、副标题、页脚。

| 时间 | 幕 | 画面 |
|---|---|---|
| 0.0–1.2 | 凝 | 纸面带胶片颗粒，整幕从 1.06 倍缓慢推近（推到 7.9s）；屏幕上方几十颗像素聚成一滴墨，墨滴拉长 |
| 1.2–1.75 | 落 | 墨滴脱离、加速坠落，拖尾随速度伸长 |
| 1.75–3.2 | 散 | 整幕震 3px；两圈细环荡开；墨滴炸成约 6000 颗像素喷溅（近快远慢、带阻力，部分大块中途裂开）；约 3% 落成墨渍 |
| 3.2–4.6 | 旋 | 旋涡场：每颗像素被拉向各自的轨道半径，内圈快外圈慢；墨渍变淡 |
| 4.6–5.75 | 聚 | 像素按从左到右的顺序脱离旋涡飞向「梦付千秋」的字格，到位后吸附到整数网格锁定，梦 → 付 → 千 → 秋 依次成形 |
| 5.85–7.9 | 成 | 字面呼吸（偶发半像素抖动）；印章砸下、墨环荡开；扫描线从上扫过，线以上的像素换成真实字体（同一份 `fillText`，所以严丝合缝）——像素态每格留 1px 缝隙是点阵，字体态是实心，所以看得出"被填实"；伴随一次套印错位（两层灰色残影 ±2.6px 归位）；副标题打字 |
| 7.9–8.35 | 归 | 扫描线再扫一次，字重新解体成像素；纸面转透明（`.is-lifting`，指针事件放开） |
| 8.5–10.0 | 归 | 页面进场放行；像素飞回各自在页面里的家——约 12% 撒到侧边栏品牌字「梦付千秋」的字形上（每个字格最多 8 颗、±2.5px 抖动，是一层灰而不是一坨），其余按首屏 `[data-enter]` 元素的面积分配，**在该元素开始进场的那一刻抵达**；分不到家的像灰一样向上散去 |

| 事项 | 做法 |
|---|---|
| 播不播 | `BaseLayout.astro` `<head>` 里的一段内联脚本在首帧之前决定：本会话没看过（`sessionStorage.site-intro-seen`）且没开 `prefers-reduced-motion` 才给 `<html>` 加 `site-intro-active`；幕本身 `display:none`，没这个 class 就不会闪一下 |
| 只播一次 | `site-intro-seen` 在决定播的**当下**就写入，所以中途刷新落到页面而不是重播 |
| 强制重播 | `?intro=1` 或 `#intro` |
| 跳过 | 右下按钮、点任意处、Esc / Enter / 空格。跳过不是淡出：像素从当前位置直接飞回家，页面立即放行（约 0.7s） |
| 像素 ↔ 元素同步 | `BaseLayout` 暴露 `window.__peekPageEnter()`，返回首屏进场计划 `[{ el, at, kind }]`；开场按 `at` 安排抵达。首屏元素太多（计划跨度 > 1.1s）时，放行时传 `timeScale` 压缩页面的交错节奏，保证 10s 内收尾 |
| 字与像素对齐 | 标题用离屏 canvas 的 `fillText` 采样格子，扫描线换成字体时画的是同一份 `fillText`，不用 DOM 文字，所以不存在基线对不齐 |
| 滚动 | 幕在时每帧确认 `lenis.stop()`（模块脚本按文档顺序执行，Lenis 可能在幕之后才创建），不锁 `<html>` 的 overflow（会因滚动条消失而横向跳一下）；方向键也拦截 |
| 中途导航 / resize | `astro:before-swap` 里停帧、恢复 Lenis；resize 直接跳过（所有坐标都失效了） |
| 性能 | 桌面 ≤ 7000 颗 / 3–5px 格 / DPR ≤ 2，触屏 ≤ 2200 颗 / DPR ≤ 1.5；物理按 1/120s 固定步长累加，每帧最多 12 步；后台切回来不追帧 |
| 探针 | `[data-site-intro]` 上有 `data-phase`（凝落散旋聚成归）和 `data-alive`（存活像素数，每 10 帧更新） |

时间点全在 `SiteIntro.astro` 顶部的 `T` 对象里；粒子预算是 `MAX` / `MIN`，字号是 `fontSize`（`min(16vw, 26vh, 300px)`）。

### 2.5 约定

每个页面脚本都遵循同一套生命周期：

```js
const CLEANUP_KEY  = '__areSetXxxCleanup__';
const LISTENER_KEY = '__areSetXxxBound__';

function initXxx() {
  window[CLEANUP_KEY]?.();          // 先清理上一次
  ... 
  window[CLEANUP_KEY] = () => { ... };  // 注销：abort signal、kill triggers、移除节点
}
initXxx();
if (!window[LISTENER_KEY]) {
  document.addEventListener('astro:page-load', initXxx);
  window[LISTENER_KEY] = true;
}
```

因为 Astro 的 ClientRouter 会换 DOM 但不重载页面，每个脚本必须能重复执行且不叠加副作用。已知的坑：

- 模块脚本在硬加载时会先执行一次，`astro:page-load` 又执行一次。所以 `initXxx` 必须幂等。
- **不要**把一次性状态放在 `initXxx` 内部的局部变量里（会被第二次初始化清零），要放模块级（三连印章的计数器就是这么修的）。
- 向 SVG 里 `appendChild` 这类操作要先 `replaceChildren()`（标签星图的连线曾因此翻倍）。

### 2.6 性能约定

- 所有进场动画只动 `transform` / `opacity` / `clip-path`，不碰 `filter: blur`。
- `will-change` 只在动画期间挂上，结束用 `clearProps` 摘掉。
- 物理模拟按固定步长（标签星图 1/60s）累加时间，避免 165Hz 上跑得比 60Hz 快 2.75 倍。
- 每帧强制布局读取要节制（时间轴的年份跟随做了 4 帧一次）。

---

## 三、可调参数速查

| 想改什么 | 去哪 |
|---|---|
| 进场位移距离 / 时长 / 缓动 | `BaseLayout.astro` 的 `ENTER_OFFSET`、`duration: 1.6`、`CustomEase.create('enter', ...)` |
| 进场交错节奏 | `ENTER_STAGGER`、`ENTER_ORDER`、组间 `+= 0.08` |
| 重播的进出阈值 | `BaseLayout.astro` 的 `reach()` |
| 重播时横向元素的竖直偏移 | `ENTER_SCROLL_BIAS`（44px） |
| 正文逐块浮现的快慢 | `global.css` 里 `.prose .pr` 区块（每类各有一条 transition） |
| 跑马灯 | `HomeTicker.astro` 顶部：`BASE_SPEED` / `HOVER_FACTOR` / `MAX_BOOST` / `MAX_SKEW` |
| 时间轴手卷 | `timeline.astro`：`scrub: 0.55`、甩动系数 `velocity * 260` |
| 标签星图 | `tags/index.astro`：斥力 `3200`、弹簧 `140 / weight`、衰减 `alpha *= 0.985`、`STEP = 1/60` |
| 侧边栏折叠 | `Header.astro`：GSAP 时间线的三个时间点 + CSS 的 `820ms` |
| 搜索弹窗 | `BaseLayout.astro` 的 `animateSearchModal()` |
| 归档分类切换的快慢 | `archive.astro` 顶部：`EXIT_CLIP` / `EXIT_COLLAPSE` / `ARRIVE_AT` / `ARRIVE_CLIP` / `SECTION_MOVE` |
| 统计页数据表的开合 | `stats.astro` 里 `duration: 0.85`（开）/ `0.6`（关）；行级联在 `global.css` 的 `.stats-table.is-animated tr`（每行 40ms，最多数到第 18 行） |
| 站点进场幕的节奏 / 文案 | `SiteIntro.astro`：`T` 对象各时间点、`MAX` / `MIN` 粒子预算、`fontSize`；frontmatter 的 `tagline`，标题在脚本顶部的 `TITLE` |
| 站点进场幕只播一次的范围 | `BaseLayout.astro` `<head>` 内联脚本：把 `sessionStorage` 换成 `localStorage` 即为"每设备一次" |

---

## 四、未完成 / 待办

### 需要你自己动手的

1. **代码块标题没人用**。`title="文件名"` 和 `{3-5}` 高亮都能工作（用临时文章验证过），但站内 9 篇没有一处在用。想用的话直接在 `src/content/posts/*.md` 的围栏上加：

   ````md
   ```cpp title="MyActor.h" {2-4}
   ````

2. **首页「愤青言论」只有一条**。位置在 `src/pages/index.astro` 的 `.home-rant`，现在是「如果觉得这个社会不好，那就努力去斗争」。三连点印章可见。

3. **系列归属**。目前只有 UE5 Meta（7 篇 + 导读）和 RenderDoc（2 篇）配了 `series` / `seriesOrder`。新文章要归入系列，记得两个字段一起写。分类同理（`category`，现在只有「引擎开发」「图形逆向」）。

### 没验证过的

4. **真机性能**。所有动画只在 headless Chrome 里验证过逻辑正确性，165fps 的实际手感没测。重点关注：文章页滚动时正文逐块浮现、时间轴 pin 段、标签星图的力导向收敛（约 4s）。
5. **移动端**。时间轴在 <1024px 会退化成竖向列表、标签星图高度是 `min(70vh, 44rem)`、统计页图表在窄屏的表现——都只写了样式，没在真机或窄视口跑过。
6. **`astro preview` 之外的部署环境**。分类深链 `/archive?category=xxx`（不带尾斜杠）在 preview 下返回 200，GitHub Pages 上没验证。

### 已知的取舍

7. **About 页的像素开场已退役**（2026-09-19），站点进场幕接管了"首次落地"的开场；About 页现在和其他页一样只播 `[data-enter]` 进场。
8. **标签星图是 O(n²) 斥力**。20 个标签没问题，标签数涨到 60+ 会开始吃 CPU，那时需要空间网格或降级成静态布局。
9. **搜索索引进站才拉**。首次打开搜索面板要等 fetch（localStorage 没缓存索引）。

### 讨论过但没做

10. RSS 订阅（注意站点是 `noindex`，要不要公开自己定）
11. 阅读记忆（localStorage 记录已读 + 阅读位置，卡片盖「阅」章）
12. 印章工坊 `/seal`（输入 2–4 字生成像素印章并导出 SVG/PNG）

### 收尾

13. **本次改动尚未提交**。`git status` 里有 23 个改动文件 + 5 个新增文件，建议先 `npm run dev` 逐页看过再提交。

---

## 五、本地验证方法

排查动效问题时，`chrome --headless --virtual-time-budget` **不可用**——它会冻结 rAF，GSAP 的时间线永远停在半路，看到的是假象。

要用真实时间的 CDP 驱动：

```js
// 启动 chrome：--headless=new --remote-debugging-port=9333 --window-size=1600,1200
// 然后 fetch http://127.0.0.1:9333/json 拿 webSocketDebuggerUrl，连上后：
//   Page.navigate → sleep(真实时长) → Runtime.evaluate(表达式, awaitPromise: true)
```

常用探针：

```js
// 某个元素当前的进场状态
el.dataset.enterState + '/' + el.className + '/' + getComputedStyle(el).opacity

// 触发器的实际区间（判断"够不够得着"）
ScrollTrigger.getAll().filter(t => t.trigger === el)
  .map(t => `${t.vars.id}:${Math.round(t.start)}..${Math.round(t.end)}`)

// 跑起来后看滚动位置是否真的在变
window.lenis.scrollTo(2000, { immediate: true })
```

注意 headless 下 `evaluate` 的返回会等 `awaitPromise`，所以探针里可以用 `await new Promise(r => setTimeout(r, 2000))` 等动画跑完再取快照，全部在一个表达式里完成。
