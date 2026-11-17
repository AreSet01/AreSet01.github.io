# 动效系统与页面说明

> 记录全站「梦付千秋 · 清浅纸境水墨」60–120fps 动效架构、页面交互契约与可调参数。
> 最后更新：2026-11-18

---

## 一、全站路由与核心功能

### 页面矩阵

| 路由 | 说明 |
|---|---|
| `/` | 首页。3D 宣纸弹性文章卡片、EWMA 速度滤波跑马灯、水墨长卷统计胶囊与三枚隐藏彩蛋 |
| `/archive` | 全部分类归档。顶部纯合成器水墨胶囊游标（反向圆角几何补偿），切换时按墨迹收干/渗开与年份块高度联动重排 |
| `/timeline` | 年轮。竖向滚动被 pin 住转成横向手卷，支持惯性拖拽、毛笔笔锋进度与墨滴涟漪节点 |
| `/tags` / `/tags/[tag]` | 标签星图（固定步长力导向星座，悬停点亮共现脉络）与标签详情（列表逐条渗墨刷出） |
| `/stats` | 写作统计。Hero 数字 + KPI + 四张挥毫统计图 + 平滑开合的 `<details>` 数据表 |
| `/about` | 关于页。宣纸名刺排印与可点击切换多组印文的朱砂石章 |
| `/posts/[slug]` | 文章阅读与伴读。单次温润正文显现、阻尼阅读脊线、湿墨连续划线、书法飞白「墨问」、锁定正文宽度的分屏/全屏伴读、飞墨对照台、文内搜索与单 rAF 惯性 Mermaid 画布 |
| `/mindmap` | 思维导图工作台。单 rAF 惯性平移与焦点阻尼滚轮缩放、层级收锋非对称贝塞尔水墨枝蔓（`stroke-dashoffset` 生长/收拢）与实时小地图 |
| `/notes` | 案头便签中心。3D 宣纸笺悬停、多维筛选锚点预滚动与删除时按需触发的墨迹收干（`@keyframes notesCardInkDry`） |
| `/gallery` | 暗房画廊。底片水墨显影（`data-developed="1"`）、五段式空态平滑收放与画廊灯箱 |
| `/life` | 线装生活志。毛笔笔触分类游标、手账卡片抽签与 3D 册页翻转详笺（`openCardFolio`） |
| `/settings` / `/account` | 偏好设置与账户中心。墨玉阻尼滑块（实时联动四套主题、行云手书/像素字体、水墨指针拖尾）、纯合成器 `scaleX` 页签游标、朱砂验印与云墨同步脉动 |

### 全局特性

**四套主题与切换仪式** —— 支持 `light`（浅色宣纸）、`dark`（深色徽墨）、`moss`（绿粉青苔）、`rice`（古籍米笺），以及像素点阵 / 行云手书（`html[data-font="kai"]`）双字形切换；切换时激发柔和的水墨晕环（`spawnThemeInkRipple`），并在 View Transition 期间静默内层 CSS 过渡消除阴影重绘卡顿。

**全局壳层微交互** —— 侧边栏导航采用 `WeakMap` 预缓存几何坐标与毛笔微拉伸磁吸游标；指针水墨拖尾与圆圈光标合入单一 `rAF` 调度（双层浓淡中锋，离屏与 `document.hidden` 自动休眠）；自定义右键菜单（`siteContextMenu.ts`）采用竹简笺条展开与游走墨衬 Pill；无感版本检测（`appAutoUpdate.ts`）以飞鸽朱砂小笺滑入提示；「烟雨濛濛」微气象（`ZenRainscape` / `ZenSoundscape`）通过三层 `Path2D` 批绘雨丝微澜并与程序化白噪音音景联动。

**系列导航与分类筛选** —— frontmatter 加 `series` / `seriesOrder` 自动生成顶部墨点进度条与底部上下篇卡片；frontmatter 加 `category` 驱动 `/archive?category=xxx` 深链筛选。

**站点进场幕** —— 每个浏览器会话首次打开任意页面时播放 10s「墨化为像素」（`src/components/SiteIntro.astro`），支持 `?intro=1` 强制重播与随时跳过放行。

**代码块与加密文章** —— Shiki 解析 `title="..."`、`{3-5}` 行高亮与自动行号；运行时增强按高度自适应时长的平滑折叠/展开与「钤印已录」复制反馈；加密文章解锁时执行「破封启卷」动效。

**统一湿墨划线、墨问与伴读工作台** —— 正文划词可触发湿墨浸润连续高亮与批注、书法飞白墨圈「墨问」（`InkAsk.astro`，对接 `server/ask.mjs`，无后端时自动静默隐藏）、锁定阅读列宽的分屏/全屏伴读面板（`CompanionLayout.astro`）以及抛物线飞白入驻的对照工作台（`PinWorkbench.astro`）。

---

## 二、动效架构

### 2.1 全局壳层、页面进场、Lightbox FLIP 与路由转场（`BaseLayout` / `PostTransition` / `Header`）

页面上任何带 `data-enter="<kind>"` 的元素都会被编排进场。`initPageEnter` 先统一预读几何坐标（`preMetaMap`）再批量写入初始态，注册 `paper-glide`（宣纸舒卷）、`ink-seep`（水墨毛细渗透）与 `cinnabar-seal`（朱砂石章钤印）三条专属缓动，并在 `finishEnter` 结束时通过 `clearProps` 及时释放 `willChange`。

**kind 取值**

| kind | 动作 |
|---|---|
| `left` / `right` / `top` / `bottom` | 从对应方向沿 `paper-glide` 温润滑入 |
| `scale` / `bloom` | 缩放或纯合成器 `clip-path: inset(...)` 宣纸绽放（严禁逐帧 `filter: blur`） |
| `stamp` | 朱砂石章压纸钤落（`cinnabar-seal`），落点激发朱砂余韵光环（`spawnStampSealHalo`）与无阴影飞墨粒子，内部 `[data-count]` 数字同步 count-up |
| `ink` | 从行首日期位置以圆形 `clip-path` 按 `ink-seep` 渗开整行 |

**全局图片/图表查看器（Lightbox FLIP）**

- 彻底移除旧版 1100ms `filter: blur` 拖尾与遮罩逐帧 `backdrop-filter` 动画。
- 采用宣纸绫裱四角画框（`image-viewer-silk-corners`）纯合成器 FLIP：`520ms` 展开 / `360ms` 收拢；连续切图通过 `image-viewer-media-ghost` 执行 `210ms` 双层交叉淡入，消除重缩放闪烁。

**水墨路由转场（`src/components/PostTransition.astro`）**

- 采用预计算 `COS_LUT` / `SIN_LUT` 驱动的浓淡双层水墨晕染与书法飞白枯笔丝缕（`feibaiStreaks`），底衬读取 `--bg-base` 自动适配四套主题。
- 揭开阶段使用 `globalCompositeOperation = 'destination-out'` 自中心破墨澄明，并在同时满足 `state.p >= 0.75` 与真实时间进度 `>= 0.62` 时精准放行新页进场。

**两套触发**

- 首屏元素（`rect.top < 视口高 * 0.92`）走一条交错时间线，按方向分组：先左右、再上下、最后 stamp/ink，组间有 0.08s 停顿。
- 其余元素注册两个 ScrollTrigger：
  - `enter:in-N` —— 进入视口一定深度时**播放**
  - `enter:out-N` —— 完全离开视口时**静默重置**并重新武装

阈值不对称是有意的：播放在"刚进来一点"，重置要等到"完全出去"。两者如果都用同一条线，任何微小的布局抖动都会让元素反复重播。

**首次播放 vs 重播的方向**

首次播放用作者写死的方向；重播时垂直分量跟随滚动方向（向下滚则从下往上进，向上滚则从上往下落），所以动作永远和"它从哪儿来"一致。滚动方向由 `html[data-scroll-dir]` 承载。

**逃生舱**

| 属性 | 作用 |
|---|---|
| `data-enter-once` | 只在硬加载时进场一次（侧边栏用） |
| `data-no-replay` | 永不重播（pin 内部元素用，见下） |
| `data-enter-hold` | 挂起整页进场，等 `window.__releasePageEnter()`（站点进场幕走 `window.__siteIntroPending`，放行时可传 `{ timeScale }` 压缩交错） |
| `data-enter-state` | 运行时状态：`in` / `out`，其他脚本判断"动画有没有在管这个元素" |

挂起有安全保险：开场脚本若异常未调用 release，页面也会自动放行，绝不永久空白。`window.__peekPageEnter()` 返回首屏进场计划 `[{ el, at, kind }]` 供进场幕对齐像素落点。

**为什么 pin 内部要 `data-no-replay`**：时间轴页的 stage 被 ScrollTrigger pin 住，pin spacer 会改变触发器的坐标；元素如果会重播，坐标算错就会误触发。

**触发器只量一次，页面长高要告诉它**：`leaveEnter()` 会先校验元素是否真的在视口外，还在视口内则改为 `refresh()`；`BaseLayout` 在 capture 阶段监听全局 `toggle` 事件刷新 `<details>` 开合。任何改变页高的组件（展开面板、加载更多）结束时也应调 `ScrollTrigger.refresh()` + `lenis.resize()`。

### 2.2 文章阅读器与伴读生态（`PostLayout` / `global.css` / `CompanionLayout` / `PinWorkbench` / `MermaidRenderer`）

正文的每个直接子元素在运行时打上 `.pr` 和 `data-pr="<kind>"`，由 IntersectionObserver 切换 `.is-in`，**单次温润显现后立即 `unobserve`**（不再使用 `resetObserver`，彻底消除上下回看时的闪烁与半透明回退）：

| kind | 动作 |
|---|---|
| `block` | 轻盈上浮淡入 |
| `heading`（h2） | 顶部朱墨渐变分割线从左运笔延展；未入场 `:not(.is-in)` 偏移 `-10px`，`.pr.is-in` 完成态严格归零 `translate3d(0, 0, 0)` |
| `subheading`（h3） | 未入场 `:not(.is-in)` 偏移 `-8px`，`.pr.is-in` 完成态严格归零 `translate3d(0, 0, 0)` |
| `code` | 自上而下 `clip-path` 擦出（外包 `.pr-wrap` 避免裁剪影响可见性判定）；支持按高度自适应时长的折叠/展开与「钤印已录」复制反馈 |
| `image` | 从中心圆形渗开，点击无缝衔接全局宣纸绫裱 Lightbox FLIP |
| `table` / `list` | 行/项轻量级联（排队索引上限收敛为 `Math.min(i, 3)`，杜绝大表格慢动作排队） |
| `quote` | 温润引号落定（无静态或动态 `blur` 滤镜） |

阅读增强与伴读组件：

- **左缘阅读脊线**：采用 `rAF` 柔顺阻尼运笔（`stepSpineBrush`），经过章节标题时墨点晕开朱砂微芒（`spineDotCinnabarBloom`）；点击目录跳转抵达目标标题时触发水墨底纹轻拂。
- **破封启卷**：加密文章口令验证通过时播放朱砂启封与宣纸展卷过渡。
- **湿墨连续划线与选区托盘**：跨行/跨代码选区经 `classifyRectsToGeometry` 合并几何，按划词长度计算湿墨浸润时长（`computeWetInkStrokeDuration`），选区托盘（`ArticleSelectionDock`）纯合成器显隐零 `blur`。
- **分屏/全屏协同与飞墨对照台**：`CompanionLayout` 在分屏与全屏切换时锁定背景正文阅读列宽，避免长文重排换行；`PinWorkbench` 支持选区抛物线飞白入驻与单 `rAF` 预缓存尺寸拖拽；`MermaidRenderer` 在内嵌与全屏下共用单帧 `rAF` 惯性平移与双指/滚轮缩放，并注册 `__areSetMermaidCleanup__`。

### 2.3 3D 宣纸卡片、水墨游标与归档切换（`cardMotion.ts` / `archive.astro` / `CollectionFilters.astro`）

**3D 宣纸弹簧卡片物理（`src/utils/cardMotion.ts`）**

- 首页、便签等 `.paper-card[data-tilt]` 仅在 `pointerenter` 预缓存一次 `getBoundingClientRect`（滚动/缩放时标脏），高频 `pointermove` **零同步布局读取**。
- `1/120s` 步长弹簧积分驱动微倾角、纸面轻抬与宣纸漫射光泽（sheen），指针移出后自然欠阻尼回弹并在收敛后自动停帧休眠。

**游走式水墨胶囊游标（反向圆角几何补偿）**

- 归档筛选栏（`.archive-ink-pill`）、集合筛选栏（`CollectionFilters`）、生活志分类栏（`.life-tab-brush-glider`）与账户中心页签（`.account-tab-glider`）均采用单枚底衬游标，仅过渡 `transform: translate3d(x, y, 0) scale(sx, sy)` 与 `opacity`。
- 为避免 `100px × 36px` 基准胶囊在非等比 `scale(sx, sy)` 下圆角畸变，通过 `--pill-rx: (halfH / sx)px` 与 `--pill-ry: (halfH / sy)px` 做反向椭圆圆角补偿；在 `prefers-reduced-motion: reduce` 下关闭过渡但保留游标几何定位，杜绝激活按钮对比度丢失。

**归档列表水墨收展时间线（`src/pages/archive.astro`）**

一条可随时打断重规划的 GSAP 时间线，全程只动 `height` / `clip-path` / `opacity`：

| 阶段 | 动作 |
|---|---|
| 离开的行 | 墨从行首日期处**收干**（`clip-path` 圆缩到 0），同时行高塌到 0，后续行连续上移 |
| 整年清空 | 该年 section 整体塌陷（高度 + 上下 margin + 淡出），内部行只收墨不塌高 |
| 回来的行 / 整年 | 同帧隐式量取 `getBoundingClientRect().height` 后从 0 撑开，墨自日期处重新渗开 |
| 年份计数 | `n entries` 数字随之滚动，结束时统一 `ScrollTrigger.refresh()` + `lenis.resize()` |

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

### 2.6 划词问答（`src/components/InkAsk.astro`）

| 阶段 | 动作 |
|---|---|
| 出印 | 选区落定（`selectionchange` 静默 280ms）→ 正文里选满 2 个字 → 探测 `/api/ask` 可用 → 34px 的「问」印在选区末尾钤下（`scale 1.7 + rotate −16°` 过冲落定，`::after` 荡开一圈墨环） |
| 圈字 | 点印：`getClientRects()` 取所有行盒 → 两笔手画的墨圈按 `pathLength=1` + `stroke-dashoffset` 从左上起笔画出（第二笔细而淡，是飞白）；高度 > 220px 的选区改画页边一道竖笔 |
| 开卡 | 卡片用 `clip-path: circle(0 → r)` 从**印的位置**渗开，`r` 是到卡片最远角的距离 |
| 流式 | 回答按 `requestAnimationFrame` 合帧重渲染（每个片段都重排 markdown 会卡），末尾一粒呼吸的墨点；服务端发 `{t:1}` 时状态文字从「研墨中」变「思量中」 |
| 收笔 | Esc / 点空白：墨圈淡去，卡片把墨收回落印处（`circle(r → 0)`，380ms） |

布局：桌面贴着选区下方（下方不够 300px 且上方更宽裕时翻到上方，`is-above` 用 `translateY(-100%)`）；`<768px` 变成底部抽屉（`is-sheet`，只改定位，不参与动画）。位置全部是文档坐标（`left/top + scrollX/Y`），所以滚动时不用跟随；`ResizeObserver` 只负责重画（图片、字体加载会让正文挪位）。

选区→正文的对应：前端把 `cloneContents()` 里的代码块工具栏、mermaid 按钮等脚本注入的节点剔掉，再补上块间换行，得到和服务端从 `dist/posts/**/index.html` 里抽出来的同一串文字；再带上选区前后各 40 字，服务端按「前文 + 选区 + 后文」整体匹配来定位（同一段代码里相同的宏名不会认错）。服务端找不到就 422——接口因此没法被当成通用聊天机器人用。

服务端 `server/ask.mjs` 与部署见 `server/README.md`；前端探测不到它（比如 GitHub Pages）就整个不出现。

### 2.7 筛选为空（`/gallery`、`/notes`、`/life`）

三个列表页「筛到 0 条」共用同一条时间线（`gallery.astro` 的 `applyFilters()` 是基准，`notes.astro` 的 `renderCards()` 与 `life.astro` 的 `applyFilters()` 逐字对齐；`tests/empty-state-parity.test.mjs` 会把常量钉住）：

| 阶段 | 动作 |
|---|---|
| ① 钉高 | 把容器 `min-height` 钉在当前 `offsetHeight`，切换那一帧文档高度不突变 |
| ② 视口回流 | `window.scrollY > 80` 时用 Lenis 把视口送回筛选栏（`offset -90`、`0.65s`、outExpo）；没有 Lenis 退回 `scrollIntoView({behavior:'smooth'})` |
| ③ 卷收 | 退场卡片 `clip-path: inset(0 100% 0 0)` + `opacity 0` + `scale .98`，`0.28s power2.inOut`，`stagger 0.02` |
| ④ 换骨 + 浮现 | 卷收结束的**同一刻**展示空面板并 `y 16→0 / scale .98→1 / 0.42s power2.out`；容器仍保持钉住的高度 |
| ⑤ 塌缩 | 容器 `min-height` 在 `0.55s power2.inOut` 内收到 0，逐帧只刷新滚动上限；**归零之后**才挂 `is-empty`（`display:none`）并做一次完整刷新 |

要点：

- 塌缩期间**不能**把滚动位置硬钳到新的 limit（`lenis.scrollTo(limit, { immediate: true })`），否则整页会一格一格往下跳。`refreshScroll(clamp)` 的 `clamp = false` 就是为这段开的：只 `ScrollTrigger.refresh()` + `lenis.resize()`，不钳制。
- `is-empty` 必须等高度归零再挂，否则 `display:none` 会把 0.55s 的塌缩变成单帧瞬塌——这正是 notes/life 早先与 gallery 不一致的地方。
- 打断：`renderCards` / `applyFilters` 开头先 kill 时间线，再「先量后清」`minHeight`（量到的是被打断那一帧的钉住高度），所以快速连点不会留下失效的钉高；塌缩 tween 挂在同一条 `filterTimeline` 里，一次 kill 全部收干净。
- 空切空（在同一页的两个 0 条筛选之间切换）走 0.38s 原位浮现，不钉高、不回滚。
- 空 → 有结果方向 notes/life 保留 0.18s 面板淡出（gallery 是瞬隐），属有意保留的超集，不影响空态表现。
- notes 的换骨帧会 `container.innerHTML = ''`（清卡片、保留钉高），life 的卡片常驻 DOM、只标 `is-filtered-out`；两者 DOM 策略不同，时间点与常量相同。
- **空 → 有内容**：空面板的隐藏必须和「恢复卡片」落在同一帧（`gallery.astro` 场景 B 的换骨回调）。若在场景 B 开头就同步隐藏，那一帧网格还是 `min-height: 0px`、卡片还是 `display:none`，文档会短到「比视口还矮」，浏览器直接把滚动位置钳到顶——观感就是点一下无过渡跳回最顶。`tests/gallery-empty-to-content.test.mjs` 锁着这个顺序。

### 2.8 普通筛选的滚动落点（`/notes`、`/life`）

列表页筛选会让看板变矮；如果换骨那一帧直接重排，浏览器会把滚动位置一帧钳到新上限——观感就是「整屏瞬移」。这里的做法**不是**给高度加锁（那会留出空白、还会让视口自己滑远），而是把这一次校正提前成一次平滑滑动：

| 步骤 | 动作 |
|---|---|
| ① 量 | 换骨前同步做一次不可见的布局测量：把「筛完后的布局」挂上去、量完立即还原（同一帧内完成，不产生绘制），得到新的滚动上限与锚点卡的新位置 |
| ② 锚点 | 锚点 = 视口顶部那张卡；把它筛后的位置校回原来的 viewport offset 就是落点。锚点卡被筛掉了就退到离原位最近的一张，再兜底到新的滚动上限 |
| ③ 滑 | 卷轴卷收的这 `0.26s` 里用 Lenis 平滑滑到落点（outExpo） |
| ④ 换骨 | 换骨帧只 `refreshScroll({ clamp: false })`（不钳制，避免打断这次滑动）；进入动画结束时再做一次完整刷新 |

要点：

- 页面高度该变还是变（不加高度锁、不留空白），只是视口不再被它带着甩走。
- notes 的测量方式：暂存旧列 → `mountCards(filtered)` → 量 → 清空 → 还原旧列（节点只 detach，事件监听器不丢）。life 的测量方式：临时切换 `is-filtered-out` 量一次，再按快照还原。
- 实测（13 条 → 2 条，先滚到底）：改前 `scrollY 886 → 34` 在一帧内完成；改后 `0.24s` 滑到位，换骨帧 `scrollY` 稳定在 34。
- 和 2.7 的分工：**筛到 0 条**走空态塌缩（有高度锁）；**筛到非 0 条**走这里的预滚动（无高度锁）。

### 2.9 思维导图与应用工作台（`/mindmap`、`/notes`、`/gallery`、`/life`、`/settings`、`/account`）

- **思维导图工作台（`src/pages/mindmap.astro` + `src/utils/mindmapEngine.ts`）**：
  - 单 `rAF` 视口物理（`tickViewportPhysics`）统一合并拖拽平移、指数摩擦惯性（`Math.exp(-5.6 * dt)`）与焦点阻尼滚轮缩放（`1 - Math.exp(-20 * dt)`）；视口几何由 `ResizeObserver` 预缓存（`cachedVpRect`），`pointermove` / `wheel` 零同步回流。
  - 连线采用按深度单调收锋（`computeInkBranchStrokeWidth` / `computeInkBranchOpacity`）的非对称三次贝塞尔书法枝蔓（`buildInkBranchPath`），展开与折叠节点时通过 `stroke-dashoffset` 演绎水墨枝蔓生长与收拢，并同步更新 `#mm-minimap`。
- **便签 / 画廊 / 生活志**：
  - `/notes` 静息卡片不挂常驻 `clip-path` 以完整保留 3D `preserve-3d` 纸面倾角，仅在 `.is-deleting` 期间触发 `@keyframes notesCardInkDry` 墨迹收干。
  - `/gallery` 图片加载完成后写入 `data-developed="1"` 演绎暗房水墨显影。
  - `/life` 卡片支持点击「展卷」以 3D 线装册页翻转（`rotateY` + `transformOrigin: left center`）打开手账详笺。
- **偏好设置与账户同步（`/settings`、`/account`）**：
  - `/settings` 墨玉滑块采用弹性阻尼位移，严格对齐全站状态协议（`html[data-cursor-trail="disabled"]` + `localStorage('cursor-trail')`、`html[data-font="kai"]` + `localStorage('site-font')`、`window.__applyTheme`）。
  - `/account` 采用纯合成器 `scaleX` 页签游标（`.account-tab-glider`），登录验印与导图云端同步（`mindmapSync.ts`）配备朱砂落印与云墨呼吸脉冲。

### 2.10 性能约定（60–120fps 零掉帧硬指标）

- **纯合成器属性**：所有进出场、游标、抽屉、弹窗与卡片悬浮只过渡 `transform` / `opacity` / `clip-path`，严禁逐帧 `filter: blur(...)`、`backdrop-filter` 或 `box-shadow` 直接过渡（阴影统一拆至伪元素仅过渡 `opacity`）。
- **零高频同步回流**：`pointermove`、`wheel`、`scroll` 热路径严禁读取 `getBoundingClientRect` / `offsetWidth` / `offsetHeight`；一律在 `pointerenter`、拖拽起点或 `ResizeObserver` 中预缓存尺寸并由单 `rAF` 合帧消费。
- **帧率无关与离屏休眠**：弹簧、惯性与粒子模拟采用固定步长（`1/120s` 或 `1/60s`）或帧间隔指数阻尼，消除 60Hz 与 120/165Hz 速度差异；所有 Canvas 循环响应 `visibilitychange` / IntersectionObserver 自动休眠。
- **显存与生命周期洁净**：`will-change` 仅在动画期按需挂载，结束立即释放；所有页面脚本通过 `AbortController` 与 `window.__areSet*Cleanup__` 实现幂等销毁；全站完整覆盖 `prefers-reduced-motion: reduce`。

---

## 三、可调参数速查

| 想改什么 | 去哪 |
|---|---|
| 进场位移 / 东方水墨缓动 | `BaseLayout.astro` 的 `ENTER_OFFSET`、`paper-glide` / `ink-seep` / `cinnabar-seal` 曲线 |
| 全局 Lightbox FLIP 时长 | `BaseLayout.astro` 的 `VIEWER_OPEN_MS`（520ms）/ `VIEWER_CLOSE_MS`（360ms） |
| 路由水墨飞白转场 | `PostTransition.astro`：`feibaiStreaks`、`COS_LUT` / `SIN_LUT`、放行阈值 `state.p >= 0.75 && progress >= 0.62` |
| 3D 宣纸卡片弹簧物理 | `src/utils/cardMotion.ts` 的 `PAPER_TILT_CONFIG`（倾角上限、刚度、阻尼、光泽强度） |
| 正文显现与阅读脊线 | `global.css` 的 `.prose .pr` 区块；`PostLayout.astro` 的 `stepSpineBrush` 与 `articleMotion.ts` |
| 湿墨划线浸润时长 | `src/utils/unifiedHighlightGeometry.ts` 的 `computeWetInkStrokeDuration()` |
| 跑马灯 | `HomeTicker.astro` 顶部：`BASE_SPEED` / `HOVER_FACTOR` / `MAX_BOOST` / `MAX_SKEW` |
| 时间轴手卷 | `timeline.astro`：`scrub: 0.55`、甩动系数 `velocity * 260` |
| 标签星图 | `tags/index.astro`：斥力 `3200`、弹簧 `140 / weight`、衰减 `alpha *= 0.985`、`STEP = 1/60` |
| 侧边栏折叠与磁吸游标 | `Header.astro`：`readArticleMotion().panelMs`、`setupNavMagneticGliderController` |
| 归档分类切换与胶囊游标 | `archive.astro`：`EXIT_CLIP` / `EXIT_COLLAPSE` / `ARRIVE_AT` / `ARRIVE_CLIP` / `--pill-rx` |
| 筛选为空的空状态节奏 | `gallery.astro` / `notes.astro` / `life.astro` 共享常量：卷收 `0.28`、浮现 `0.42`、塌缩 `0.55`、回滚 `offset -90` / `0.65s` |
| 普通筛选的滚动落点 | `notes.astro` / `life.astro` 的 `captureViewportAnchor()`、`predictedMax`、Lenis `duration: 0.26` |
| 思维导图惯性与水墨枝蔓 | `mindmap.astro` 的 `tickViewportPhysics`；`mindmapEngine.ts` 的 `computeInkBranchStrokeWidth` / `buildInkBranchPath` |
| 站点进场幕的节奏 / 文案 | `SiteIntro.astro`：`T` 对象各时间点、`MAX` / `MIN` 粒子预算、`fontSize`、`TITLE` |
| 划词问答的墨圈与卡片节奏 | `InkAsk.astro`：`strokePoints()`、`ANCHOR_CHARS`、`MAX_SELECTION` |
| 划词问答的模型 / 限流 / 缓存 | `server/ask.env.example`（部署时是 `/etc/blog-ask.env`），说明见 `server/README.md` |

---

## 四、内容维护与后续演进备忘

### 内容配置提示

1. **代码块文件名与行高亮**：在 `src/content/posts/*.md` 的围栏上可直接启用：

   ````md
   ```cpp title="MyActor.h" {2-4}
   ````

2. **首页三连印章彩蛋**：文案位于 `src/pages/index.astro` 的 `.home-rant`，连续三次点击右下印章展开。
3. **系列与分类归属**：新文章归入系列需在 frontmatter 同时填写 `series` 与 `seriesOrder`；归档分类填写 `category`。

### 架构取舍与候选方向

4. **About 页开场**：早先的独立像素开场已合并由全局 `SiteIntro.astro` 接管首次会话落地体验。
5. **标签星图规模**：当前标签量级采用固定步长力导向；若未来标签涨至 60+ 可切换空间网格加速。
6. **可选后续特性**：RSS 订阅、跨设备阅读位置记忆与独立印章工坊 `/seal`。

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
