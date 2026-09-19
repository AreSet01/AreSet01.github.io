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
| `/stats` | 写作统计。hero 数字 + KPI + 四张图（发文节奏、每篇体量、累计字数、标签分布）+ 数据表 |

导航栏现在是：`Main*` / `All Doc` / `Timeline` / `Tags` / `Stats` / `About Me`。

### 新增功能

**系列导航** —— frontmatter 加 `series` 与 `seriesOrder`，文章页自动生成顶部墨点进度条（悬停出标题）和底部上/下篇卡片。已配置两个系列：UE5 Meta 七篇（含导读）、RenderDoc 两篇。

**分类筛选** —— frontmatter 加 `category`（每篇手填，刻意比 tags 粗）。All Doc 顶部出现筛选 chips，切换时列表用 FLIP 收拢；文章页的 meta 行可点进对应分类，链接形如 `/archive?category=引擎开发`。

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
| `data-enter-hold` | 挂起整页进场，等 `window.__releasePageEnter()`（About 开场用） |
| `data-enter-state` | 运行时状态：`in` / `out`，其他脚本判断"动画有没有在管这个元素" |

**为什么 pin 内部要 `data-no-replay`**：时间轴页的 stage 被 ScrollTrigger pin 住，pin spacer 会改变触发器的坐标；元素如果会重播，坐标算错就会误触发。

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

### 2.3 约定

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

### 2.4 性能约定

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
| About 开场节奏 | `about.astro`：`GATHER` / `GATHER_SPREAD` / `HOLD_END` / `DROP_DUR` / `FADE_START` |
| 侧边栏折叠 | `Header.astro`：GSAP 时间线的三个时间点 + CSS 的 `820ms` |
| 搜索弹窗 | `BaseLayout.astro` 的 `animateSearchModal()` |

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

7. **About 开场每次进入都播**，约 4.3s。想改成每会话一次，在 `about.astro` 的 `startIntroOnce()` 里加一句 sessionStorage 判断即可。
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
