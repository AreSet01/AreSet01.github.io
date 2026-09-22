# Handoff Report — Explorer 2: Canvas Ink Brush & Particle Splash Audit

## 1. Observation

### Obs 1: `#inkCanvas` Element, Uncapped DPR, and Sizing
- **File**: `src/components/Header.astro:99, 140-148`
- **Code Quote**:
  ```html
  99: <canvas id="inkCanvas" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 100005;"></canvas>
  ```
  ```javascript
  140:   function resize() {
  141:     if (!canvas) return;
  142:     const dpr = window.devicePixelRatio || 1;
  143:     canvas.style.width = window.innerWidth + 'px';
  144:     canvas.style.height = window.innerHeight + 'px';
  145:     canvas.width  = window.innerWidth  * dpr;
  146:     canvas.height = window.innerHeight * dpr;
  147:     ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // absolute set, never accumulates
  148:   }
  ```
- **Finding**: DPR is completely uncapped. On 2x Retina displays (1728x1117 viewport), the buffer is 3456x2234 (~7.72 megapixels), consuming ~30.9 MB single buffer / ~61.8 MB GPU double buffer. On 3x mobile screens (1170x2532), it consumes ~11.8 MB single / ~23.7 MB double buffer. No debounce on `window.addEventListener('resize', onResize)` at line 329.

### Obs 2: Perpetual rAF Execution in `Header.astro`
- **File**: `src/components/Header.astro:244-248, 294-319`
- **Code Quote**:
  ```javascript
  244:     if (!brush.isVisible && points.length === 0) {
  245:       isDrawing = false;
  246:     } else if (isDrawing) {
  247:       requestAnimationFrame(updateAndDraw);
  248:     }
  ```
  ```javascript
  294:     function onPointerEnter(e) {
  295:       brush.isVisible = true;
  ...
  308:     function onPointerMove(e) {
  ...
  310:       brush.isVisible = true;
  ...
  315:       if (!isDrawing) {
  316:         isDrawing = true;
  317:         requestAnimationFrame(updateAndDraw);
  318:       }
  319:     }
  ```
- **Finding**: When mouse movement ceases while the cursor is inside the window, `points.length === 0` after ~60 frames, but `brush.isVisible` remains `true` because `onPointerLeave` is never fired. The condition `(!brush.isVisible && points.length === 0)` evaluates to `false`. The animation loop never halts when the user is idle reading an article, running continuously at 60Hz–165Hz.

### Obs 3: Gaussian Shadow Blur in Canvas 2D Path Fill
- **File**: `src/components/Header.astro:224-232`
- **Code Quote**:
  ```javascript
  224:       ctx.shadowBlur = 2;
  225:       ctx.shadowColor = `rgba(${baseR},${baseG},${baseB},${head.currentOpacity})`;
  226:       ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${head.currentOpacity * 0.9})`;
  227:       ctx.fill();
  228:       ctx.shadowBlur = 0;
  ```
- **Finding**: Setting `ctx.shadowBlur = 2` breaks the 2D hardware rasterizer fast path and mandates offscreen mask generation with separable Gaussian blur convolutions on every frame.

### Obs 4: Listener Leak on Astro View Transitions
- **File**: `src/components/Header.astro:336-350`
- **Code Quote**:
  ```javascript
  337:     isMobile = !window.matchMedia('(pointer: fine)').matches;
  338:     window.addEventListener('resize', () => {
  339:       isMobile = !window.matchMedia('(pointer: fine)').matches;
  340:     });
  ...
  342:     cleanupFns.push(
  343:       () => window.removeEventListener('resize',       onResize),
  344:       () => window.removeEventListener('pointerenter', onPointerEnter),
  345:       () => window.removeEventListener('pointerleave', onPointerLeave),
  346:       () => window.removeEventListener('pointermove',  onPointerMove),
  347:       () => window.removeEventListener('pointerdown',  onPointerDown),
  348:       () => window.removeEventListener('pointerup',    onPointerUp),
  349:     );
  ```
- **Finding**: The anonymous arrow function on `window.addEventListener('resize', ...)` at line 338 is not registered in `cleanupFns`. On every page navigation via Astro View Transitions (`astro:page-load`), `init()` adds a new unmanaged resize listener closure to `window`. Furthermore, `isMobile` is dead code (never queried).

### Obs 5: DOM Particle Emitter Node & Timer Flood
- **File**: `src/layouts/BaseLayout.astro:932-1033, 1066`
- **Code Quote**:
  ```javascript
  932:         function sparkle(x, y, count) {
  ...
  947:           const splotchCount = Math.max(3, Math.round(count * 0.35));
  ...
  950:             const el = document.createElement('div');
  ...
  968:               boxShadow: `0 0 ${size + 3}px ${color}`,
  970:               filter: 'blur(0.3px)',
  ...
  978:             window.setTimeout(() => {
  979:               requestAnimationFrame(() => {
  ...
  986:                   filter: 'blur(2.5px)',
  ...
  990:             window.setTimeout(() => el.remove(), 1300);
  ...
  1032:          document.body.appendChild(frag);
  ```
- **Finding**: Every single page click (`sparkle(clickX, clickY, 18)`) creates 24 `<div>` elements, attaches inline blur filters and transitions, and queues 48 `setTimeout` and 24 `rAF` callbacks. When `data-enter="stamp"` cards scroll into view, `splashAt(el)` fires `sparkle(..., 14)` (19 elements) on every bidirectional scroll trigger.

### Obs 6: Radial Gradient Object Churn in Ambient Canvas
- **File**: `src/layouts/BaseLayout.astro:1089-1167`
- **Code Quote**:
  ```javascript
  1135:           function drawDots(time) {
  1136:             ctx.clearRect(0, 0, viewportWidth, viewportHeight);
  1137: 
  1138:             for (const dot of dots) {
  ...
  1156:               const gradient = ctx.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, dot.r * pulse * 2.5);
  1157:               gradient.addColorStop(0, dot.color);
  1158:               gradient.addColorStop(1, 'transparent');
  1159:               ctx.fillStyle = gradient;
  1160:               ctx.fill();
  1161:             }
  1162:             ambientFrame = requestAnimationFrame(drawDots);
  1163:           }
  ```
- **Finding**: `createRadialGradient` and 2 `addColorStop` calls are executed 32 times per frame, generating **1,920 (at 60Hz) to 3,840 (at 120Hz) `CanvasGradient` objects and 7,680 color stops per second** on the main thread, with zero pooling.

---

## 2. Logic Chain

1. **Obs 1 & Obs 2** establish that `#inkCanvas` operates a continuous animation loop whenever the user's cursor is anywhere over the page, clearing and drawing an uncapped high-resolution (up to 3456x2234 on Retina) canvas on every display refresh tick (60Hz–165Hz).
2. **Obs 3** proves that during these active frames, `ctx.shadowBlur = 2` forces offscreen Gaussian blur passes across the ribbon polygon on the CPU/GPU rasterizer.
3. **Obs 6** proves that behind the page DOM, a second full-screen canvas (`data-ambient-canvas`) runs an unconditional 100% continuous rAF loop, churning up to 3,840 gradient allocations per second.
4. **Obs 1, Obs 2, Obs 3, and Obs 6** together demonstrate that even when the user is completely stationary and reading an article, the browser is forced to composite TWO full-screen fixed canvas textures every frame while executing multi-thousand allocations per second.
5. **Obs 5** establishes that clicks and scroll stamp re-entries bypass canvas and flood the DOM tree with up to 24 animated `<div>` elements per trigger, animating CSS `filter: blur()`, scheduling dozens of timers, and exacerbating scroll jank during bidirectional Lenis scrolling.
6. **Obs 4** demonstrates that Astro View Transition navigation leaves unmanaged window resize listeners behind, creating closure leaks across sessions.

---

## 3. Caveats

- **No runtime headless browser profiling was conducted** in this phase; all findings are derived from static source code analysis, algorithmic evaluation, mathematical calculations of VRAM/allocation rates, and browser rendering engine specifications (Blink/WebKit).
- **GPU process memory** behavior may vary slightly between macOS Metal-backed Skia and Windows Direct2D/ANGLE backends.
- **No source code or config files were modified** in accordance with the strict read-only audit protocol.

---

## 4. Conclusion

The Canvas Ink Brush and Particle Splash systems possess two critical performance vulnerabilities:
1. **Permanent CPU/GPU Wake Lock**: The main `#inkCanvas` rAF loop fails to sleep when stationary due to an inverted boolean check (`!brush.isVisible && points.length === 0`), and `data-ambient-canvas` has no idle concept at all.
2. **Extreme Allocation Churn**: Up to 3,840 radial gradient instances per second in the ambient canvas, combined with 24 DOM elements and 48 timers per click splash.

These issues directly contribute to battery drain, thermal throttling on mobile devices, and micro-stutter during article reading and scrolling.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify `#inkCanvas` Idle Loop**:
   Open Chrome DevTools -> Performance tab or Console on `localhost:4321`. Move the mouse into the viewport and then let it sit completely still for 5 seconds. Place a breakpoint or log in `Header.astro:152` (`updateAndDraw`). Observe that `requestAnimationFrame` continues firing at display refresh rate indefinitely.
2. **Verify Leaked Resize Listeners**:
   In DevTools Console, navigate between pages 5 times. Execute:
   `getEventListeners(window).resize`
   Observe multiple anonymous arrow function listeners accumulating on `window`.
3. **Verify Ambient Canvas Gradient Churn**:
   In Chrome DevTools -> Performance -> Memory, take an Allocation instrumentation on timeline. Observe rapid allocation of `CanvasGradient` objects matching 32 per frame.
4. **Inspect Source Locations**:
   - `src/components/Header.astro`: Lines 99, 140–148, 151–248, 338–349.
   - `src/layouts/BaseLayout.astro`: Lines 518–544, 932–1035, 1089–1167.
   - `src/styles/global.css`: Lines 3242–3267.
