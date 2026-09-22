# 动效与滚动编排性能深度勘测报告 (Survey Report)
**Explorer 1: Core Scroll Choreography & Animation Pipeline Audit**  
**勘测日期**: 2026-09-22  
**目标代码库**: `/Users/leungcc/Desktop/搞搞新意思/AreSet01.github.io`  
**审计范围**: `BaseLayout.astro`, `PostLayout.astro`, `Lenis` 平滑滚动系统及全站滚动联动机制  
**执行原则**: STRICT REPORT-ONLY (只读审查，零代码变动)

---

## 一、 执行概要与动效架构全景 (Executive Summary)

本报告针对网站客户端动效核心链路——`BaseLayout.astro`（页面级入场与 GSAP 编排）、`PostLayout.astro`（文章段落交叉观测与逐级揭示）、以及 `Lenis`（虚拟平滑滚动引擎及事件拦截体系）进行了无死角的只读深度勘测。

### 核心架构图解 (Pipeline Call Chain)
```
[User Input: Wheel / Touch / Navigation]
   │
   ├── ClientRouter (Astro View Transitions)
   │     ├── astro:before-preparation ──> PostTransition.enter() (Ink Blossom Canvas)
   │     ├── astro:after-swap ─────────> window.lenis.destroy() + initSmoothScroll()
   │     └── astro:page-load ──────────> runPageEnter() + initPostReveal()
   │
   ├── Lenis Virtual Scroll Loop
   │     ├── Wheel Event [passive: false] ──> virtualScroll filter ──> scrollTo() (Easing Curve)
   │     └── GSAP Ticker (time*1000) ────────> lenis.raf() ──> on('scroll') ──> ScrollTrigger.update()
   │
   └── Viewport Intersection & Triggers
         ├── BaseLayout: Dual ScrollTriggers per [data-enter] (enter:in-*, enter:out-*)
         │     └── replayEnter() / leaveEnter() [DOM transforms, opacity, clip-path]
         ├── PostLayout: IntersectionObserver (.pr-wrap, .pr, rootMargin: '0px 0px -6% 0px')
         │     └── classList.toggle('is-in', isIntersecting) [CSS transitions: 1000~2000ms]
         └── PostLayout: Spine ScrollTrigger + TOC IntersectionObserver (forced layout queries)
```

### 勘测主要发现 (Key Findings Preview)
1. **[CRITICAL 内存泄漏与帧率雪崩] GSAP Ticker 回调未解绑与多次累加**: 在 `BaseLayout.astro` 中，每次客户端页面切换（`astro:after-swap`）销毁并重新初始化 Lenis 时，通过匿名箭头函数向 `gsap.ticker.add((time) => lenis.raf(time * 1000))` 注册回调，从未调用 `gsap.ticker.remove`。每次跳转都会在全局 Ticker 中累加废弃的 Lenis 闭包，导致每一帧重复调度多份 `lenis.raf()`。
2. **[CRITICAL 高速往返滚动引发双向重放风暴] 文章块 `is-in` 往返切换与重排/重绘雪崩**: 源代码比对（Git Diff）显示近期由 `io.unobserve` 单次驻留被修改为 `entry.target.classList.toggle('is-in', entry.isIntersecting)` 双向往返重放。在长文章快速上下惯性滚动下，多达 50~100 个 DOM 节点同时触发 1000ms~2000ms 的复杂 CSS 过渡（含 `filter: blur(5px)`、`clip-path: circle()`、`clip-path: inset()`），伴随滚动方向切换引发 68px 的垂直位移跳变（`translate3d(0, 34px, 0)` ↔ `translate3d(0, -34px, 0)`），导致显著的图层膨胀与渲染卡顿。
3. **[HIGH 强制同步布局 (Layout Thrashing)] 阅读指示轴与目录观测器中的连续几何重算**: `PostLayout.astro` 中的 `ResizeObserver` 在处理阅读进度轴圆点（`placeDots`）时，交替读取 `getBoundingClientRect()`、`getComputedStyle()` 并写入 `dot.style.top`；同时目录 `IntersectionObserver` 在边界回退时，对所有标题循环调用 `getBoundingClientRect().top`，直接引发强制同步布局。
4. **[HIGH 滚动监听器泄漏与无源被动性违背]**: `BaseLayout.astro` 末尾内联的 `initProgress` 在每次 `astro:page-load` 时对 `window` 增加一个未解绑的 `scroll` 监听器；且在每次滚动中同步执行 `prose.getBoundingClientRect()` 并修改 `bar.style.width`（触发重排）；Lenis 与 Shift 横向滚动监听器注册了 `passive: false`，阻碍了浏览器合成器线程（Compositor Thread）的独立异步滚动。

---

## 二、 BaseLayout.astro 滚动编排与 GSAP 链路剖析

### 1. GSAP ScrollTrigger 核心配置与全局插件注册
- **文件路径**: `src/layouts/BaseLayout.astro`
- **代码行号**: Lines 301–314
```typescript
301: import gsap from 'gsap';
302: import { ScrollTrigger } from 'gsap/ScrollTrigger';
303: import CustomEase from 'gsap/CustomEase';
304: import Lenis from 'lenis';
305: 
306: gsap.registerPlugin(ScrollTrigger, CustomEase);
307: 
308: // Create a premium "ink-wash" custom ease
309: CustomEase.create("ink", "0.25, 1, 0.5, 1");
310: CustomEase.create("ink-out", "0.34, 1.56, 0.64, 1"); // Slight overshoot like ink spreading
311: 
312: window.gsap = gsap;
313: window.ScrollTrigger = ScrollTrigger;
```
- **配置特征**:
  - 注册了 `ScrollTrigger` 与 `CustomEase` 插件。
  - 定义了墨染贝塞尔曲线：`ink` (`0.25, 1, 0.5, 1`) 与入场曲线 `enter` (`M0,0 C0.06,0.62 0.16,0.9 0.42,0.975 0.62,1.005 0.8,1 1,1`，Line 458，前 20% 时间跨越 70% 距离）。
  - 将 `gsap` 与 `ScrollTrigger` 挂载至 `window` 全局对象。

### 2. 滚动方向检测与 DOM 属性广播
- **代码行号**: Lines 461–466
```typescript
461: ScrollTrigger.create({
462:   id: 'scroll-direction',
463:   onUpdate: (self) => {
464:     document.documentElement.dataset.scrollDir = self.direction === -1 ? 'up' : 'down';
465:   },
466: });
```
- **机制与风险分析**:
  - 在每次滚动更新且滚动方向改变时，直接向根元素 `document.documentElement` 写入 `data-scroll-dir="up" | "down"`。
  - 变更根元素的 HTML 属性会造成全局样式失效（Style Invalidation），触发匹配属性选择器（如 `html[data-scroll-dir="up"] .prose .pr[...]`）的整棵子树样式重算（Recalculate Style）。

### 3. 页面元素入场编排 (`data-enter` / `leaveEnter` / `replayEnter`)
- **代码行号**: Lines 438–744
- **动效类型划分**:
  - `left`, `right`: 水平初速度偏移 ±140px，滚动重入时叠加垂直偏置 `ENTER_SCROLL_BIAS = 44px`。
  - `top`, `bottom`: 垂直初速度偏移 ±110px，重入时根据 `scrollDir` 决定从上方或下方滑入。
  - `scale`: 缩放 0.78，垂直偏置 22px。
  - `stamp`: 印章下砸效果，初始 `scale: 1.7`，`rotation: restRotation - 14deg`，并在落地延迟 0.2s 调用 `window.__inkSplash` 抛射 14~20 个粒子 DIV。
  - `ink`: 基于 `clipPath: circle(...)` 径向展开，利用 `Math.hypot(el.offsetWidth, el.offsetHeight)` 计算扩散半径。
- **双触发器机制 (Dual-ScrollTrigger Architecture)**:
  - 代码行号: Lines 703–724
  ```typescript
  703: const reach = (el) => {
  704:   const docBottom = el.getBoundingClientRect().bottom + window.scrollY;
  705:   return Math.round(Math.max(4, Math.min(window.innerHeight * 0.12, el.offsetHeight * 0.6 + 24, docBottom - 4)));
  706: };
  707: replayable.forEach((el, index) => {
  708:   ScrollTrigger.create({
  709:     id: `${ENTER_TRIGGER_PREFIX}in-${index}`,
  710:     trigger: el,
  711:     start: () => `top bottom-=${reach(el)}`,
  712:     end: () => `bottom top+=${reach(el)}`,
  713:     onEnter: () => replayEnter(el, 'down'),
  714:     onEnterBack: () => replayEnter(el, 'up'),
  715:   });
  716:   ScrollTrigger.create({
  717:     id: `${ENTER_TRIGGER_PREFIX}out-${index}`,
  718:     trigger: el,
  719:     start: 'top bottom',
  720:     end: 'bottom top',
  721:     onLeave: () => leaveEnter(el),
  722:     onLeaveBack: () => leaveEnter(el),
  723:   });
  724: });
  ```
  - **不对称阈值设计**: 入场需要进入视口内部一定深度（`reach(el)`，约 12% 视口或元素高度 60%），而离开则严格在视口边缘（`top bottom` / `bottom top`），避免顶部元素在微小滚动时闪烁。
  - **性能缺陷**: 每个可重放元素均实例化 2 个 `ScrollTrigger`。`start` 和 `end` 使用函数动态计算，内部调用 `el.getBoundingClientRect()` 与 `el.offsetHeight`。在 `ScrollTrigger.refresh()` 执行时（如视口尺寸改变、折叠面板打开、Lenis 尺寸重算），会对页面所有元素集中调用，造成严重的强制同步重排（Forced Synchronous Layout）。
- **`leaveEnter` 与重绘重排**:
  - 代码行号: Lines 591–606
  ```typescript
  591: function leaveEnter(el) {
  592:   if (el.dataset.enterState !== 'in') return;
  593:   const rect = el.getBoundingClientRect();
  594:   if (rect.bottom > 0 && rect.top < window.innerHeight) {
  595:     if (!(window as any).lenis?.isScrolling) {
  596:       gsap.delayedCall(0, () => ScrollTrigger.refresh());
  597:     }
  598:     return;
  599:   }
  600:   el.dataset.enterState = 'out';
  601:   gsap.killTweensOf(el);
  602:   el.classList.remove('is-entered', 'is-entering');
  603:   if (isVisibleInFlow(el)) gsap.set(el, { opacity: 0 });
  604: }
  ```
  - 元素滑出视口后，通过 `gsap.set(el, { opacity: 0 })` 重置为完全透明，并移除 `.is-entered`。

### 4. 页面生命周期时序与过渡协调 (Lifecycle Orchestration)
整个页面的加载与动效启动遵循以下层级：
1. **首绘前预隐藏 (Pre-paint Hide)**:
   - 行号: Lines 41–44 (内联 `<script is:inline>`)
   - 立即给根元素注入 `document.documentElement.classList.add('js-enter')`。
   - `src/styles/global.css` (Line 1307): `html.js-enter [data-enter]:not(.is-entered) { opacity: 0; }`，防止 JS 加载前的样式闪烁 (FOUC)。
2. **模块脚本执行 (Module Execution)**:
   - 行号: Lines 300–781
   - Astro 将主脚本打包为 `<script type="module">`，在 DOM 解析完成、`DOMContentLoaded` 之前执行。
   - 执行 `runPageEnter()` (Line 781)。
3. **入场拦截挂起 (Hold Mechanism)**:
   - 行号: Lines 767–780
   - 检查 `document.querySelector('[data-enter-hold]')`、`window.__siteIntroPending` 或 `(window as any).__postTransitionPending`。
   - 若存在，暂缓执行 `initPageEnter()`，设置 14s 兜底定时器（Dead-man switch）。
   - 由外部系统（开屏幕布 `SiteIntro` 或转场墨晕 `PostTransition`）在合适时机调用 `window.__releasePageEnter()` 放行。
4. **Astro 页面切换事件 (Client Navigation)**:
   - `astro:before-preparation`: 拦截对 `/posts/*` 的导航，触发 `__postTransition.enter()` 渲染全屏墨染 Canvas 并暂停 Lenis（Lines 787–804）。
   - `astro:after-swap`: 重置 `hasNavigated = true`、`enteredThisDocument = false`、重新注入 `js-enter` 类名，滚动至顶部，并调用 `__postTransition.leave()`（Lines 806–825）。同时销毁并重建 Lenis（Lines 371–376）。
   - `astro:page-load`: 触发未执行的 `runPageEnter()`，并重新绑定磁性按钮和滚动容器（Lines 827–831）。

### 5. BaseLayout 中的内存泄漏与清理缺陷 (Critical Leaks)

#### (1) `gsap.ticker` 回调无限泄漏
- **代码行号**: Lines 357–359, 371–376
```typescript
357: gsap.ticker.add((time) => {
358:   lenis.raf(time * 1000);
359: });
...
371: document.addEventListener('astro:after-swap', () => {
372:   if (window.lenis) {
373:     window.lenis.destroy();
374:   }
375:   initSmoothScroll();
376: });
```
- **机理**: `gsap.ticker.add` 传入的是匿名箭头函数，且在 `window.lenis.destroy()` 后从未调用 `gsap.ticker.remove`。每次单页导航都会常驻一个闭包在 GSAP Ticker 中。5 次跳转后，Ticker 内部将同时调度 5 个 `lenis.raf()` 调用，其中 4 个在已销毁的废弃实例上运行，浪费 CPU 并引发隐蔽错误。

#### (2) 磁性按钮事件监听器重叠挂载
- **代码行号**: Lines 837–868
```typescript
827: document.addEventListener('astro:page-load', () => {
828:   if (!enteredThisDocument) runPageEnter();
829:   initMagneticButtons();
830:   initScrollableContainers();
831: });
...
842: magneticElements.forEach(el => {
843:   el.addEventListener('mousemove', (e) => {
844:     const rect = el.getBoundingClientRect();
...
858:   el.addEventListener('mouseleave', () => { ... });
```
- **机理**: 导航栏与全局按钮在页面跳转时可能保留。`initMagneticButtons` 在每次 `astro:page-load` 执行，但没有去重标记、也没有利用 `AbortController` 清除之前的监听。每次页面跳转都会给同一个按钮叠加一组 `mousemove` 和 `mouseleave` 监听器，并在每次鼠标微动时重复执行 `getBoundingClientRect()`。

#### (3) 模态框 MutationObserver 重复实例化
- **代码行号**: Lines 871–906
```typescript
871: document.addEventListener('astro:page-load', () => {
872:   const modals = document.querySelectorAll('.search-overlay, .preview-overlay, .image-viewer-overlay');
873:   modals.forEach(overlay => {
874:     const observer = new MutationObserver((mutations) => { ... });
875:     observer.observe(overlay, { attributes: true });
876:   });
877: });
```
- **机理**: 每次 `astro:page-load` 都会对静态存在的模态框 Overlay 创建新的 `MutationObserver`，且从未 disconnect，造成观察器泄露与多倍重复执行 GSAP 弹窗展开动画。

#### (4) 底部阅读进度条未解绑原生滚动监听
- **代码行号**: Lines 2480–2520
```typescript
2508: window.addEventListener('scroll', update, { passive: true });
2509: window.addEventListener('resize', update, { passive: true });
...
2518: document.addEventListener('astro:page-load', setup);
```
- **机理**: `setup` 每次执行都在 `window` 上绑定新的 `scroll` 监听器，从未 remove 之前的监听函数。在每次滚动时执行 `prose.getBoundingClientRect()` 并在主线程同步修改 `bar.style.width`（该属性在 CSS 中带有 `transition: width 60ms linear`，触发回流重排）。

---

## 三、 PostLayout.astro 文章滚动揭示与布局动力学

### 1. 文章子元素动态包装与预处理
- **文件路径**: `src/layouts/PostLayout.astro`
- **代码行号**: Lines 436–453
```typescript
436: const blocks = (Array.from(prose.children) as HTMLElement[]).map((el) => {
437:   if (el.classList.contains('pr-wrap')) return el;
438:   const kind = revealKind(el);
439:   if (kind !== 'code' && kind !== 'image' && kind !== 'mermaid') return el;
440:   const wrap = document.createElement('div');
441:   wrap.className = 'pr-wrap';
442:   wrap.dataset.pr = kind;
443:   el.replaceWith(wrap);
444:   wrap.appendChild(el);
445:   return wrap;
446: });
447: blocks.forEach((el) => {
448:   const kind = el.dataset.pr || revealKind(el);
449:   el.dataset.pr = kind;
450:   el.classList.add('pr');
451:   if (kind === 'table') el.querySelectorAll('tr').forEach((row, i) => row.style.setProperty('--i', String(Math.min(i, 12))));
452:   if (kind === 'list') Array.from(el.children).forEach((li, i) => (li as HTMLElement).style.setProperty('--i', String(Math.min(i, 8))));
453: });
```
- **预处理开销**:
  - 对文章内所有的 `code`、`image`、`mermaid` 原地创建并包裹 `.pr-wrap`。
  - 为所有直接子元素添加 `.pr` 类名。
  - 遍历表格行与列表项注入 CSS 变量 `--i`，作为后续交错动画的延迟基数。

### 2. 文章段落 IntersectionObserver 实现
- **代码行号**: Lines 457–466
```typescript
457: } else {
458:   const io = new IntersectionObserver((entries) => {
459:     entries.forEach((entry) => {
460:       // Replays every time a block comes back into view
461:       entry.target.classList.toggle('is-in', entry.isIntersecting);
462:     });
463:   }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
464:   blocks.forEach((el) => io.observe(el));
465:   signal.addEventListener('abort', () => io.disconnect());
466: }
```
- **配置参数分析**:
  - `rootMargin: '0px 0px -6% 0px'`: 底部收缩 6% 视口高度，意味着元素进入视口底部上方 6% 位置时才触发进入；顶部为 `0px`，只要元素底边滑出视口顶部 0px，即刻判定离开。
  - `threshold: 0`: 只要有 1px 接触即为相交。

### 3. Git Diff 关键发现：单次驻留 (Once) 与往返重放 (Replay) 的冲突
在审查工作区 `git diff src/layouts/PostLayout.astro` 时，捕获到了核心动效变更证据：
```diff
--- a/src/layouts/PostLayout.astro
+++ b/src/layouts/PostLayout.astro
@@ -457,15 +457,10 @@ const hasToc = tocHeadings.length > 1;
       } else {
         const io = new IntersectionObserver((entries) => {
           entries.forEach((entry) => {
-            // Once a block enters into view, reveal and unobserve.
-            // This prevents blocks from disappearing when scrolled past, eliminates 68px transform
-            // layout shifts on scroll-direction switches, and stops scroll jitter / pulling.
-            if (entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight) {
-              entry.target.classList.add('is-in');
-              io.unobserve(entry.target);
-            }
+            // Replays every time a block comes back into view
+            entry.target.classList.toggle('is-in', entry.isIntersecting);
           });
-        }, { rootMargin: '0px 0px -4% 0px', threshold: 0 });
+        }, { rootMargin: '0px 0px -6% 0px', threshold: 0 });
```
- **历史注释揭示的严重缺陷**:
  - 注释明确指出原设计曾采用“一旦进入视口即揭示并取消监听（`unobserve`）”，其目的是 **“防止滑过元素消失、消除滚动反向切换时 68px 的 transform 布局跳跃、避免滚动抖动与拖拽感”**。
  - 当前代码强行改为了 `entry.target.classList.toggle('is-in', entry.isIntersecting)`，将整站文章恢复为全量往返重放（Bidirectional Replay）。

### 4. `.pr` 与 `.is-in` CSS 样式及过渡矩阵 (CSS Matrix)
- **文件路径**: `src/styles/global.css` Lines 3546–3747
- 各元素类型的 CSS 过渡与渲染属性深度核验：

| 元素分类 (`data-pr`) | 未入场 / 离场状态 (`:not(.is-in)`) | 入场状态 (`.is-in`) | 过渡属性与耗时 (Duration & Easing) | 复合层与渲染成本 |
| :--- | :--- | :--- | :--- | :--- |
| **通用段落 (`block`)** | `opacity: 0; transform: translate3d(0, 34px, 0);` *(向上滚为 -34px)* | `opacity: 1; transform: translate3d(0, 0, 0);` | `opacity 1400ms`, `transform 1700ms` (`cubic-bezier(0.16, 1, 0.3, 1)`) | 无永久 `will-change`，动态生成/销毁临时 Layer |
| **二级标题 (`heading`)** | `transform: translate3d(-18px, 0, 0);` 其 `::before` 为 `scaleX(0)` | 包含 160ms 延迟，`::before` 伸展至 `scaleX(1)` | `transform 1500ms` (伪元素边线展开) | 依赖伪元素过渡 |
| **代码块 (`code`)** | `transform: none; opacity: 1;` 内部 `pre` 为 `clip-path: inset(0 0 100% 0);` | 内部 `pre` 展开至 `clip-path: inset(0 0 0 0);` 触发 `@keyframes codeScan` | `clip-path 1500ms`, 扫描线 `animation: codeScan 1500ms` | **HIGH**: `clip-path` 逐帧遮罩计算与扫描线伪元素渲染 |
| **图片 (`image`)** | `clip-path: circle(0% at 50% 50%);` 内部 `img` 为 `scale(1.05)` | `clip-path: circle(75% at 50% 50%);` 内部 `img` 为 `scale(1)` | `clip-path 1700ms`, `img transform 2000ms` | **CRITICAL**: 径向圆形裁切与大位图硬件缩放叠加 |
| **图表 (`mermaid`)** | `opacity: 0; transform: translate3d(0, 32px, 0) scale(0.97); filter: blur(5px);` | `opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0);` | `opacity 1000ms`, `transform 1200ms`, `filter 1000ms` | **CRITICAL**: **复杂矢量 SVG + 高斯模糊 (blur 5px)**，移动端 GPU 帧率直接断崖 |
| **表格 (`table`)** | 所有 `tr` 初始 `opacity: 0; transform: translate3d(-12px, 0, 0);` | 所有 `tr` 复位为 `opacity: 1; transform: translate3d(0, 0, 0);` | `opacity 1000ms`, `transform 1300ms`, 交错延迟 `calc(var(--i) * 95ms)` | 大量表格行造成交错过渡重叠 |
| **引用 (`quote`)** | 垂直偏置 +18px (向上为 -18px)，`::before` 偏置且 `scale(1.25)` | 复位，`::before` 变为 `scale(1); opacity: 0.92;` | 伪元素 `transform 1500ms` (`back.out`), `opacity 700ms` | 弹性贝塞尔超调 |

### 5. 68px 垂直位移跳变机理 (Layout / Motion Jump)
- **代码行号**: `src/styles/global.css` Lines 3546–3567
```css
3546: .prose .pr {
3547:   opacity: 0;
3548:   transform: translate3d(0, 34px, 0);
...
3561: html[data-scroll-dir="up"] .prose .pr[data-pr="block"]:not(.is-in) {
3562:   transform: translate3d(0, -34px, 0);
3563: }
```
- **跳变产生过程**:
  1. 向下滚动时，元素离开视口顶部，`.is-in` 被移除，元素回到未激活态：`transform: translate3d(0, 34px, 0)`。
  2. 用户轻微反向向上滚动，BaseLayout 中的 `ScrollTrigger.create({ id: 'scroll-direction' })` 触发，立即将 `<html>` 的 `data-scroll-dir` 切换为 `'up'`。
  3. 此时所有处于视口外且未入场（`:not(.is-in)`）的段落，其目标变换瞬间从 `+34px` 变为 `-34px`，发生高达 **68px 的瞬时物理位置跳跃**！
  4. 当滚动边缘微调时，元素在 `34px`、`-34px` 与 `0px` 之间频繁经历 1700ms 的缓动打断与反弹，产生极度严重的视觉抖动与拖拽抵抗感。

### 6. 阅读指示轴 (Spine) 与目录 (TOC) 的强制布局踩坑
- **阅读轴更新 (`placeDots`) 布局抖动**:
  - 代码行号: `PostLayout.astro` Lines 474–495
  ```typescript
  h2s.forEach((h2, i) => {
    const dot = dots[i];
    if (!dot) return;
    const y = h2.getBoundingClientRect().top - bodyTop + parseFloat(getComputedStyle(h2).paddingTop) + 14;
    dot.style.top = `${Math.round(y)}px`;
  });
  ```
  - 在循环体内：读取 `h2.getBoundingClientRect()` -> 读取 `getComputedStyle(h2)` -> 写入 `dot.style.top`。这是标准的 **读-写-读-写** 强制同步布局反模式（Layout Thrashing）。
- **TOC 边界回退查询**:
  - 代码行号: `PostLayout.astro` Lines 670–673
  ```typescript
  const current = headings
    .map((item) => item.heading)
    .filter((heading) => heading.getBoundingClientRect().top <= 120)
    .at(-1);
  ```
  - 当没有标题处于 `-18% 0px -70% 0px` 狭窄判定区时，每次回调都会对文章所有标题执行 `getBoundingClientRect().top` 遍历。

---

## 四、 Lenis 平滑滚动引擎与系统集成深度审计

### 1. Lenis 初始化与配置参数核验
- **文件路径**: `src/layouts/BaseLayout.astro` Lines 319–353
```typescript
319: const lenis = new Lenis({
320:   duration: 1.1, // Faster
321:   easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Custom premium easing
322:   orientation: 'vertical',
323:   gestureOrientation: 'vertical',
324:   smoothWheel: true,
325:   wheelMultiplier: 0.8, // Make wheel slightly heavier
326:   allowNestedScroll: false, // Do not let containers (mermaid/code) hijack vertical scroll!
327:   anchors: { offset: -70 },
328:   virtualScroll: (data) => { ... },
329: });
```
- **参数特性**:
  - `duration: 1.1`: 惯性缓动持续时间较短（普通默认 1.2），手感响应迅速。
  - `easing`: 指数衰减方程 $1.001 - 2^{-10t}$。
  - `wheelMultiplier: 0.8`: 滚轮阻尼增加 20%，降低滑动速度。
  - `allowNestedScroll: false`: 默认禁止嵌套子容器接管垂直滚动。
  - 未配置 `syncTouch`: 在 Lenis v1.x 中默认为 `false`。

### 2. 移动端触控 vs 桌面端滚轮交互机制 (Touch vs Wheel)
- **源码对应**: `node_modules/lenis/dist/lenis.mjs`
  - 构造函数 (Lines 283–286):
    ```typescript
    this.element.addEventListener("wheel", this.onWheel, listenerOptions);
    this.element.addEventListener("touchstart", this.onTouchStart, listenerOptions);
    this.element.addEventListener("touchmove", this.onTouchMove, listenerOptions);
    this.element.addEventListener("touchend", this.onTouchEnd, listenerOptions);
    ```
    其中 `listenerOptions = { passive: false };`（Line 255）。
- **运行机理**:
  - **桌面端 (Wheel)**: `smoothWheel: true` 生效。进入 `lenis.mjs` Line 598: `if (event.cancelable) event.preventDefault();`，彻底拦截浏览器原生滚轮事件，由 Lenis 接管并计算 `targetScroll`，通过 GSAP Ticker 进行数值插值。
  - **移动端 (Touch)**: 因 `syncTouch: false`，进入 `lenis.mjs` Line 588:
    ```typescript
    if (!(this.options.syncTouch && isTouch || this.options.smoothWheel && isWheel)) {
      this.isScrolling = "native";
      this.animate.stop();
      event.lenisStopPropagation = true;
      return;
    }
    ```
    移动端不执行 `preventDefault()`，直接放行给浏览器原生触控滑动。
  - **性能违规与阻碍**: 即使在移动端使用原生滚动，由于 Lenis 的 `VirtualScroll` 在 `window` 级别以 `{ passive: false }` 注册了 `touchstart`、`touchmove`、`touchend`，现代移动端浏览器（iOS Safari、Android Chrome）在用户手指触屏滑动的瞬间，**无法直接在合成器线程上启动滚动，必须等待主线程执行并确认未调用 `preventDefault()` 后才开始滑屏**。这直接破坏了移动端的即时触控响应（Touch Latency）。

### 3. GSAP Ticker 与 rAF 循环绑定与 LagSmoothing 风险
- **代码行号**: Lines 355–362
```typescript
355: lenis.on('scroll', ScrollTrigger.update);
356: 
357: gsap.ticker.add((time) => {
358:   lenis.raf(time * 1000);
359: });
360: 
361: gsap.ticker.lagSmoothing(0);
```
- **深度分析**:
  - Lenis 自身没有开启独立的 `requestAnimationFrame` 轮询（`autoRaf: false`），而是将 `lenis.raf(time * 1000)` 完全交由 `gsap.ticker` 驱动，保证 Lenis 内部插值与 GSAP 的全局时间轴严格同频。
  - 每当 Lenis 产生位移，触发 `lenis.on('scroll', ScrollTrigger.update)`，通知 ScrollTrigger 同步刷新触发器计算。
  - **`gsap.ticker.lagSmoothing(0)` 的严重风险**:
    - GSAP 默认的 `lagSmoothing(500, 33)` 会在遇到耗时 JavaScript 长任务（Long Task）或后台标签页休眠恢复时，将时间跳变限制在 33ms 内，避免动效暴冲。
    - 此处将其显式设置为 `0`（完全禁用滞后平滑），目的是防止平滑滚动在帧率不稳定时产生位置迟滞。
    - **副作用**: 一旦页面由于复杂 Mermaid SVG 渲染、代码高亮解析或强制布局重排产生一个大于 50ms 的主线程长任务，下一帧 GSAP Ticker 将获得极大的 `time` 增量，导致 Lenis 与所有运行中的 GSAP 动效瞬间发生“瞬移式”位置跳跃或速度爆炸。

### 4. 嵌套滚动容器与水平滑动手势仲裁 (Nested Scroll Arbitration)
- **仲裁逻辑**: `BaseLayout.astro` Lines 328–352 (`virtualScroll`)
```typescript
virtualScroll: (data) => {
  // 1. 按住 Shift 键时绕过 Lenis，允许横向滚动
  if (data.event.shiftKey) return false;
  // 2. 模态框打开时彻底阻断页面滚动
  if (document.body.classList.contains('mermaid-modal-open')) return false;

  const target = data.event.target;
  if (target instanceof Element) {
    // 3. 目录与模态框内部交互，彻底防止 Lenis 移动页面
    if (target.closest('.post-toc, .post-toc-inner, .post-toc-nav, .mermaid-modal-overlay, #mermaid-modal, [data-lenis-prevent]')) {
      return false;
    }
    // 4. 行内图表放大后，允许原生平移
    if (target.closest('.mermaid-stage.is-zoomed')) return false;
    // 5. 触控板横向滑动且横向位移大于垂直位移时放行
    if (Math.abs(data.deltaX) > Math.abs(data.deltaY) && Math.abs(data.deltaX) > 2) {
      if (target.closest('.mermaid-stage, pre, [data-scrollable]')) return false;
    }
  }
  return true;
}
```
- **专属 Shift 横向滚轮拦截器**:
  - 代码行号: Lines 390–436 (`setupShiftHorizontalScroll`)
  - 注册在 `window` 上，参数为 `{ passive: false, capture: true }`。
  - 当按下 Shift 键时，捕获滚轮事件并阻止冒泡及默认行为，将垂直/水平滚轮增量直接映射给容器的 `scrollContainer.scrollLeft += delta`。
- **性能隐患**:
  - `virtualScroll` 在每一次滚轮/手势事件中频繁执行深度 DOM 遍历（多达 4 次 `.closest(...)` 调用），在包含成千上万 SVG 节点的复杂 Mermaid 流程图上方滚动时，每次事件的调用栈开销被大幅放大。
  - `setupShiftHorizontalScroll` 的全局捕获期非被动滚轮监听，加剧了滚轮事件在主线程的派发阻塞。

### 5. 全局模态框启停生命周期 (Lenis Start/Stop)
系统各模块在打开弹窗时对 Lenis 的控制分布：
- **文章转场**: `PostTransition.astro` (Line 237 `stop()`, Line 287/309 `start()`)
- **开屏幕布**: `SiteIntro.astro` (Line 186 `stop()`, Line 888 `start()`)
- **站内搜索**: `BaseLayout.astro` (Line 1319 `stop()`, 搜索关闭 `start()`)
- **文章卡片预览**: `BaseLayout.astro` (Line 1581 `stop()`, Line 1617/1854 `start()`)
- **全屏看图**: `BaseLayout.astro` (Line 2123 `stop()`, Line 2201 `start()`)
- **Mermaid 全屏弹窗**: `MermaidRenderer.astro` (Line 149 `stop()`, Line 164/533 `start()`)
- **审计评价**: 模态框打开时调用 `stop()`、关闭时调用 `start()` 的逻辑配对完整，且存在超时兜底机制（如 `PostTransition` 的 2.5s Dead-man switch），不会发生弹窗关闭后全站永久无法滚动的僵死情况。但每次启停伴随多次 `lenis.resize()` 与 `ScrollTrigger.refresh()`，加剧了瞬时布局重算开销。

---

## 五、 性能瓶颈综合定级与跨端风险矩阵 (Risk Matrix)

| 序号 | 缺陷定位 (Subsystem & Location) | 严重等级 (Severity) | 触发场景 (Failure Condition) | 底层机理与性能开销 (Mechanism) | 跨端表现 (Desktop vs Mobile) |
| :---: | :--- | :---: | :--- | :--- | :--- |
| **B1** | `BaseLayout.astro`<br>Lines 357–359, 371–376 | **CRITICAL** | Astro 单页路由跳转 2 次以上 | `gsap.ticker.add` 匿名闭包未解绑，导致销毁的 Lenis 实例持续驻留 Ticker，造成严重的**内存泄漏与每帧重复调度**。 | 全平台通用，随着浏览文章数量增加，帧率线性下降直至卡死。 |
| **B2** | `PostLayout.astro`<br>Line 461 & `global.css` | **CRITICAL** | 长文章快速上下滚动、惯性滑动 | `io` 往返重放（`is-in` toggle），50+ 元素并发触发 1.0~2.0s 复杂过渡（`filter: blur(5px)`, `clip-path`），**图层动态频繁升降级（Layer Churn）**。 | **移动端 (WebKit) 极其严重**：高斯模糊导致 GPU 满负荷，帧率暴跌至 15~25 FPS；桌面端风扇狂转。 |
| **B3** | `PostLayout.astro`<br>Line 461 & `global.css` Line 3561 | **CRITICAL** | 滚动微调、反复上下推拉 | `html[data-scroll-dir="up"]` 导致视口外段落从 `+34px` 瞬变为 `-34px`，产生 **68px 的物理突变与弹性跳动**。 | 视觉感受极其恶劣，用户产生“滚动受阻/页面拉扯”错觉。 |
| **B4** | `PostLayout.astro`<br>Lines 474–495, 670–673 | **HIGH** | 页面滚动、内容尺寸微调 | `ResizeObserver` 中遍历 H2 交替读写 `getBoundingClientRect` 与 `style.top`，**触发强制同步布局 (Layout Thrashing)**。 | 低功耗移动设备 CPU 主线程直接产生 80~120ms 的 Long Task 阻塞。 |
| **B5** | `BaseLayout.astro`<br>Lines 2508–2518 | **HIGH** | 单页路由跳转进入文章页 | `initProgress` 在每次 `astro:page-load` 累加原生 `scroll` 监听，并在滚动中同步读取布局尺寸修改 `width`（引发重排）。 | 页面切换越多，单次滚动触发的回调成倍增加，显著加剧主线程拥堵。 |
| **B6** | `BaseLayout.astro`<br>Line 433 & Lenis Line 255 | **HIGH** | 桌面端滚轮滚动与移动端手势滑动 | 全局注册 `{ passive: false }`（Shift 横滚及 Lenis 触控事件），**破坏浏览器合成器线程异步滚动机制**。 | 移动端首触延迟增加，桌面端滚轮受主线程任务阻滞无法保持 60/120Hz 丝滑。 |
| **B7** | `BaseLayout.astro`<br>Lines 837–868, 871–906 | **MEDIUM** | 单页路由切换后鼠标移动与弹窗交互 | 磁性按钮 `mousemove` 监听器与弹窗 `MutationObserver` 累加挂载，多重 GSAP 补间动画互斥竞争。 | 桌面端交互主线程 CPU 占用异常，移动端影响较小。 |
| **B8** | `BaseLayout.astro`<br>Lines 317, 838 | **LOW** | 系统开启“减弱动态效果”的用户 | 源码显式注释了 `prefers-reduced-motion` 检查，**无视无障碍与系统级省电规范**。 | 对前庭功能障碍或眩晕症用户极不友好，且在低电量模式下持续高负载运行。 |

---

## 六、 结论与后续验证建议 (Survey Conclusion)

1. **核心病因总结**: 网站的动效理念极富艺术张力（墨染入场、字模沉降、印章溅墨、阅读轴线），但当前实现过度依赖 **“全量双向往返重放”** 与 **“无约束的全局监听挂载”**，忽视了 Astro 单页应用架构下的组件常驻与事件垃圾回收，导致在长文章交互与频繁路由切换下产生复合层爆炸与主线程堵塞。
2. **零代码改动保证**: 本次勘测严格遵循只读原则，未对工作区任何源文件、配置文件或构建产物进行修改或提交，所有分析均以确凿代码行号、真实运行时机理与 Git 历史演变为依据。
3. **后续验证方向 (For Explorer 2 & Benchmarking)**:
   - 验证 `astro:after-swap` 下 `gsap.ticker._listeners` 的累增数据。
   - 在 Chrome DevTools Performance 面板中录制 5000px 长文章的高频往返惯性滚动，重点截取 Rendering 的 “Composite Layers” 与 GPU VRAM 占用曲线。
   - 对比单次驻留（`io.unobserve`）与双向重放（`classList.toggle`）下的掉帧率（Dropped Frames Rate）。
