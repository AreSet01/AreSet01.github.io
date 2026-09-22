# Canvas Ink Brush and Particle Splash Systems: Animation & Performance Audit Report

**Project**: AreSet01.github.io  
**Auditor**: Explorer 2 (Animation & Performance Audit Survey)  
**Date**: 2026-09-22  
**Target Scope**: `src/components/Header.astro`, `src/layouts/BaseLayout.astro`, `src/components/PostTransition.astro`, `src/components/SiteIntro.astro`, and related styles.  
**Mode**: Strict Read-Only Investigation (Zero Code Changes).

---

## 1. Executive Summary & Architecture Overview

An in-depth performance audit was conducted on the client-side Canvas drawing engines, interactive ink brush simulations, custom cursor rendering, DOM particle splash emitters, and ambient background particle systems across the repository.

### 1.1 Architecture Matrix

| System Component | Host File | Renderer Type | Sizing & DPR Handling | Animation Loop Driver | Object Pooling | Cleanup & Lifecycle |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`#inkCanvas` Ink Brush & Cursor** | `src/components/Header.astro:99-364` | `2D Context` (`CanvasRenderingContext2D`) | Buffer: `window.innerWidth * dpr`<br>DPR: `window.devicePixelRatio` (**Uncapped**) | `requestAnimationFrame`<br>(**Perpetual Loop Bug**: never sleeps when cursor is on screen) | **None**<br>(New `InkPoint` per frame, `Array.filter` GC churn) | Partial: Cleans 6 listeners;<br>**Leaks 1 anonymous resize listener per navigation** |
| **`sparkle` Ink Splash Emitter** | `src/layouts/BaseLayout.astro:932-1067` | **Pure DOM** (`HTMLDivElement`) | Sized via inline CSS pixels (`width`, `height`, `box-shadow`) | CSS Transitions (`1.05s`) driven by `setTimeout` + nested `rAF` | **None**<br>(Allocates 24 DOM elements + 48 timers per click) | **Unmanaged**<br>(Pending timers are not canceled across Astro navigation) |
| **Ambient Dust Canvas** | `src/layouts/BaseLayout.astro:1089-1167` | `2D Context` (`CanvasRenderingContext2D`) | Buffer: `window.innerWidth` (1x CSS)<br>DPR: **Completely Ignored (1.0)** | `requestAnimationFrame`<br>(**Continuous 100% idle loop**, never stops) | **None**<br>(Allocates **1,920 - 3,840 `CanvasGradient` objects/sec**) | Managed: AbortController + `cancelAnimationFrame` + canvas removal |
| **Post Navigation Transition** | `src/components/PostTransition.astro:9-340` | `2D Context` (`CanvasRenderingContext2D`) | Buffer: `w * dpr`<br>DPR: `Math.min(dpr, 2)` (**Clamped**) | GSAP Tween driven<br>(**Demand-Driven**, runs only during route change) | Reused 48 static droplet descriptors | Managed: Resets context and terminates cleanly |
| **Site Intro Particle Canvas** | `src/components/SiteIntro.astro:77-930` | `2D Context` (Offscreen + Onscreen) | Dynamic tile rasterization & bounds calculation | Fixed-step physics (`STEP = 1/120`) inside rAF | Pre-allocated typed arrays & pooled buffers | Fully Managed: `teardown()` aborts controller & cancels rAF |

---

### 1.2 Key Vulnerability Dashboard

```
CRITICAL [C1]: #inkCanvas rAF Loop Never Sleeps While Mouse Is On Page (Continuous Battery/CPU Drain)
CRITICAL [C2]: Ambient Canvas Allocates 1,920 - 3,840 CanvasGradient Objects/Sec on Main Thread
HIGH     [H1]: DOM Particle Splash Node Explosion (24 DOM divs + 48 timers per click with CSS blur filters)
HIGH     [H2]: #inkCanvas DPR Uncapped (Up to 60MB+ VRAM GPU Allocation on 3x Retina Displays)
HIGH     [H3]: ctx.shadowBlur = 2 Applied on Every Frame Inside Canvas 2D Ribbon Rendering
HIGH     [H4]: Header.astro Leaks Anonymous Resize Event Listener on Every Astro Navigation
MEDIUM   [M1]: Custom Cursor Lags / Freezes Under High JS Thread Load (cursor: none !important)
MEDIUM   [M2]: BaseLayout Stamp Entrance Fires DOM Splash During Scroll Re-entry Animations
MEDIUM   [M3]: Dead isMobile Branch Leaves #inkCanvas Active on Mobile Touch Devices
LOW      [L1]: Ambient Canvas Ignores DPR, Causing Blurry Bokeh on High-Density Displays
LOW      [L2]: Synchronous Forced Reflow (void el.offsetWidth) on Click Pop Animation
```

---

## 2. Deep-Dive: `#inkCanvas` Ink Brush & Cursor System (`Header.astro`)

### 2.1 Element Markup, CSS Sizing, and DPR Resolution

In `src/components/Header.astro`:
```html
99: <canvas id="inkCanvas" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 100005;"></canvas>
```
And in lines 140–148:
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

#### Detailed Findings:
1. **Uncapped `devicePixelRatio`**:
   - `const dpr = window.devicePixelRatio || 1;` takes the raw DPR without upper clamping.
   - On high-density desktop displays (e.g. 16-inch MacBook Pro Retina, DPR = 2) with a 1728 x 1117 viewport:
     $$\text{Buffer Dimensions} = 3456 \times 2234 \approx 7.72 \text{ Megapixels}$$
     $$\text{VRAM Backing Store (RGBA8)} = 7,720,704 \times 4 \text{ bytes} \approx 30.88 \text{ MB}$$
     With front/back double buffering in GPU compositing, this single canvas occupies **~61.8 MB of VRAM**.
   - On mobile devices with DPR = 3 (e.g. iPhone 13/14/15/16 Pro, 390 x 844 CSS pixels):
     $$\text{Buffer Dimensions} = 1170 \times 2532 \approx 2.96 \text{ Megapixels}$$
     $$\text{VRAM Backing Store} = 2,962,440 \times 4 \text{ bytes} \approx 11.85 \text{ MB (Single Buffer)} \rightarrow 23.7 \text{ MB (Double Buffer)}$$
   - In contrast, `PostTransition.astro:113` wisely caps DPR: `const dpr = Math.min(window.devicePixelRatio || 1, 2);`.
2. **Unthrottled Resize Reallocations**:
   - Line 329: `window.addEventListener('resize', onResize);`
   - During desktop window resizing, `resize()` is invoked on every single frame (~60 times/sec). Each update to `canvas.width` and `canvas.height` resets the canvas state and forces the browser's GPU process to discard and reallocate multi-megabyte texture memory buffers.

---

### 2.2 Drawing Mechanics: 2D Context, Spring Physics, & Stroke Smoothing

In `src/components/Header.astro:151-233`:
```javascript
159:     // Spring physics
160:     const dx = mouse.x - brush.x;
161:     const dy = mouse.y - brush.y;
162:     brush.vx = (brush.vx + dx * springTension) * springDamping;
163:     brush.vy = (brush.vy + dy * springTension) * springDamping;
164:     brush.x += brush.vx;
165:     brush.y += brush.vy;
166: 
167:     const speed = Math.hypot(brush.vx, brush.vy);
168: 
169:     if (brush.isVisible && speed > 0.15) {
170:       let targetR = Math.max(3, 11 - speed * 0.2);
171:       let opacity = 0.85;
172:       if (brush.isPressed) { targetR = Math.max(7, 22 - speed * 0.3); opacity = 0.95; }
173:       brush.radius = brush.radius * 0.85 + targetR * 0.15;
174:       points.push(new InkPoint(brush.x, brush.y, brush.radius, color, opacity, speed));
175:     } else if (speed <= 0.15 && points.length > 0) {
176:       strokeId += 0.05;
177:     }
```

#### Detailed Findings:
1. **Spring-Mass Damper System**:
   - Parameters: `springTension = 0.12`, `springDamping = 0.65`.
   - Simulates physical brush lag behind pointer movement with velocity attenuation.
   - Thickness inversely scales with velocity (`11 - speed * 0.2`), simulating calligraphic brush pressure dynamics.
2. **Polygon Ribbon Normal Calculation**:
   - Lines 186–195 compute perpendicular unit normals $(\mathbf{n}_x, \mathbf{n}_y) = (-e_y / L, e_x / L)$ between adjacent points.
   - Lines 197–219 construct a closed 2D polygon using `spindle = Math.sin(prog * Math.PI) * 1.15`, tapering the stroke at the tail and head.
   - The path is drawn with straight line segments (`lineTo`). Because points are captured at rAF frequency (60–120Hz), the polygon appears visually smooth.
3. **The `ctx.shadowBlur` Bottleneck**:
   Lines 224–232:
   ```javascript
   224:       ctx.shadowBlur = 2;
   225:       ctx.shadowColor = `rgba(${baseR},${baseG},${baseB},${head.currentOpacity})`;
   226:       ctx.fillStyle = `rgba(${baseR},${baseG},${baseB},${head.currentOpacity * 0.9})`;
   227:       ctx.fill();
   228:       ctx.shadowBlur = 0;
   ```
   - Setting `ctx.shadowBlur = 2` forces the 2D canvas rasterizer (Chromium Skia / WebKit CoreGraphics) out of the fast single-pass path fill pipeline into an expensive multi-pass Gaussian blur filter.
   - The rasterizer must render the polygon into an offscreen mask, execute horizontal and vertical blur passes, composite the blurred shadow, and then draw the fill.
   - On integrated GPUs or mobile chipsets, this is a known source of frame time spikes.
4. **Redundant DOM Queries & String Allocations in Every Frame**:
   Lines 155–157:
   ```javascript
   155:     const theme = document.documentElement.getAttribute('data-theme') || 'light';
   156:     const color = theme === 'dark' ? '255,255,255' : theme === 'moss' ? '255,241,244' : '26,24,20';
   157:     const [baseR, baseG, baseB] = color.split(',').map(Number);
   ```
   - In a loop executing 60–120 times per second, querying `document.documentElement.getAttribute('data-theme')` causes unnecessary DOM attribute reading.
   - Calling `color.split(',').map(Number)` allocates a new Array of 3 numbers on every frame.

---

### 2.3 Animation Loop & The "Never-Sleeping" Idle Bug

Lines 244–248:
```javascript
244:     if (!brush.isVisible && points.length === 0) {
245:       isDrawing = false;
246:     } else if (isDrawing) {
247:       requestAnimationFrame(updateAndDraw);
248:     }
```
And event handlers in lines 294–319:
```javascript
294:     function onPointerEnter(e) {
295:       brush.isVisible = true;
...
302:     function onPointerLeave() {
303:       brush.isVisible = false;
...
308:     function onPointerMove(e) {
309:       updateMouse(e);
310:       brush.isVisible = true;
...
315:       if (!isDrawing) {
316:         isDrawing = true;
317:         requestAnimationFrame(updateAndDraw);
318:       }
319:     }
```

#### The Execution Trace of the Flaw:
1. When the user moves the mouse into the browser window:
   - `onPointerEnter` or `onPointerMove` sets `brush.isVisible = true`.
   - `isDrawing = true` is set, and `requestAnimationFrame(updateAndDraw)` begins running.
2. When the user **stops moving the mouse** (e.g. stops to read an article):
   - `mouse.x` and `mouse.y` remain stationary.
   - `brush.vx` and `brush.vy` decay toward 0.
   - No new `InkPoint` objects are pushed (`speed <= 0.15`).
   - Existing points age and are filtered out: after ~60 frames (~1.0s), `points.length === 0`.
3. **The Idle Condition Check**:
   - The loop checks `if (!brush.isVisible && points.length === 0)`.
   - However, the mouse is still inside the window! `onPointerLeave` has NOT fired.
   - Therefore, `brush.isVisible` is **`true`**!
   - `!brush.isVisible` is **`false`**.
   - `(false && true) === false`!
   - The condition is **FALSE**.
   - The engine falls through to:
     ```javascript
     else if (isDrawing) {
       requestAnimationFrame(updateAndDraw);
     }
     ```
4. **Impact**:
   - **The rAF loop NEVER goes to sleep as long as the mouse pointer rests inside the webpage**.
   - It continuously runs at 60Hz / 120Hz / 144Hz / 165Hz.
   - Every frame executes:
     - `ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);`
     - Theme string parsing.
     - Spring physics math.
     - Drawing of the custom cursor ring (`ctx.arc(mouse.x, mouse.y, 4, ...)`).
   - This prevents the CPU from entering low-power C-states and keeps the GPU compositor permanently engaged, causing battery drain on laptops and mobile devices.

---

### 2.4 Event Listeners & Astro View Transitions Leak

In `Header.astro:329-350`:
```javascript
329:     window.addEventListener('resize',       onResize);
330:     window.addEventListener('pointerenter', onPointerEnter);
331:     window.addEventListener('pointerleave', onPointerLeave);
332:     window.addEventListener('pointermove',  onPointerMove);
333:     window.addEventListener('pointerdown',  onPointerDown);
334:     window.addEventListener('pointerup',    onPointerUp);
335: 
336:     // Check mobile
337:     isMobile = !window.matchMedia('(pointer: fine)').matches;
338:     window.addEventListener('resize', () => {
339:       isMobile = !window.matchMedia('(pointer: fine)').matches;
340:     });
341: 
342:     cleanupFns.push(
343:       () => window.removeEventListener('resize',       onResize),
344:       () => window.removeEventListener('pointerenter', onPointerEnter),
345:       () => window.removeEventListener('pointerleave', onPointerLeave),
346:       () => window.removeEventListener('pointermove',  onPointerMove),
347:       () => window.removeEventListener('pointerdown',  onPointerDown),
348:       () => window.removeEventListener('pointerup',    onPointerUp),
349:     );
```

#### Detailed Findings:
1. **Missing `{ passive: true }` Flags**:
   - `window.addEventListener('pointermove', onPointerMove)` is registered without `{ passive: true }`.
   - On high-polling input devices (500Hz - 1000Hz gaming mice), non-passive window pointer handlers can block or delay compositor scrolling threads in Chromium and WebKit.
2. **The Leaked Anonymous Resize Listener**:
   - Notice lines 338–340:
     ```javascript
     window.addEventListener('resize', () => {
       isMobile = !window.matchMedia('(pointer: fine)').matches;
     });
     ```
   - Notice `cleanupFns` in lines 342–349: **This anonymous arrow function is NOT included in `cleanupFns`!**
   - On every Astro View Transition navigation, `document.addEventListener('astro:page-load', init)` runs `init()`.
   - `init()` invokes `cleanupFns.forEach(fn => fn())`, but line 338 registers a **brand new anonymous listener on `window`** without removing the previous one.
   - After navigating 15 pages in an article reading session, **15 duplicate resize listeners** reside on `window`.
3. **Dead Code: `isMobile`**:
   - Variable `let isMobile = false;` is declared at line 108, assigned at lines 337 and 339, and **never read or referenced anywhere in the script**.
   - As a result, the code intended to differentiate mobile behavior never disables the canvas on touch devices.

---

### 2.5 The Custom Cursor Dilemma (`cursor: none !important`)

In `src/styles/global.css:3242-3267`:
```css
3242: @media (pointer: fine) {
3243:   html,
3244:   body {
3245:     cursor: none !important;
3246:   }
3247:   
3248:   a,
3249:   button,
3250:   ... [many interactive selectors] ... {
3266:     cursor: none !important;
3267:   }
```
And in `Header.astro:235-242`:
```javascript
235:     // Hollow pointer circle at exact mouse location
236:     if (brush.isVisible) {
237:       ctx.beginPath();
238:       ctx.arc(mouse.x, mouse.y, 4, 0, Math.PI * 2);
239:       ctx.lineWidth   = 1;
240:       ctx.strokeStyle = `rgba(${baseR},${baseG},${baseB},0.5)`;
241:       ctx.stroke();
242:     }
```

#### Performance Risk Analysis:
- The site replaces the hardware OS cursor with a canvas-drawn software circle.
- Hardware cursors are updated asynchronously by the OS GPU display server at refresh rate, completely independent of browser main-thread activity.
- The software cursor in `#inkCanvas` depends on JavaScript running on the browser's single main thread.
- If a heavy task executes on the main thread (e.g. Mermaid diagram parsing in `MermaidRenderer.astro`, heavy GSAP layout calculation, or JSON index loading during search):
  - **The cursor completely freezes or visibly lags behind user hand movements**.
  - Because `cursor: none !important;` hides the native pointer, the user perceives the entire browser as unresponsive.

---

## 3. Deep-Dive: Particle Splash & Ambient Systems (`BaseLayout.astro`)

### 3.1 DOM Particle Splash System (`sparkle` / `window.__inkSplash`)

In `src/layouts/BaseLayout.astro:932-1035`:
```javascript
932:         function sparkle(x, y, count) {
...
946:           const frag = document.createDocumentFragment();
947:           const splotchCount = Math.max(3, Math.round(count * 0.35));
948: 
949:           for (let i = 0; i < count; i += 1) {
950:             const el = document.createElement('div');
...
958:             Object.assign(el.style, {
959:               position: 'fixed',
960:               left: `${x - size / 2}px`,
961:               top: `${y - size / 2}px`,
962:               width: `${size}px`,
963:               height: `${size * elongation}px`,
964:               borderRadius: '50%',
965:               background: color,
966:               pointerEvents: 'none',
967:               zIndex: '100006',
968:               boxShadow: `0 0 ${size + 3}px ${color}`,
969:               opacity: '0.78',
970:               filter: 'blur(0.3px)',
971:               transition: 'none',
972:               transform: `rotate(${(angle * 180 / Math.PI).toFixed(1)}deg)`,
973:               transformOrigin: 'center center',
974:             });
975: 
976:             frag.appendChild(el);
977: 
978:             window.setTimeout(() => {
979:               requestAnimationFrame(() => {
980:                 const drift = 4 + Math.random() * 8;
981:                 Object.assign(el.style, {
982:                   transition: 'transform 1.05s cubic-bezier(0.16, 1, 0.3, 1), opacity 1.05s cubic-bezier(0.22, 0.8, 0.3, 1), filter 1.05s ease-out',
983:                   transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + drift}px) rotate(${(angle * 180 / Math.PI).toFixed(1)}deg) scale(${(0.4 + Math.random() * 0.3).toFixed(2)})`,
984:                   opacity: '0',
985:                   filter: 'blur(2.5px)',
986:                 });
987:               });
988:             }, delay);
989: 
990:             window.setTimeout(() => el.remove(), 1300);
991:           }
... [repeat for splotchCount dots] ...
1032:          document.body.appendChild(frag);
1033:        }
```

#### Detailed Findings:
1. **DOM Particle vs Canvas Anti-Pattern**:
   - Rather than rendering ink splashes into a canvas, the system instantiates physical HTML `<div>` nodes and appends them to `document.body`.
2. **Spawn Multipliers Across the Site**:
   - Global Page Click (`BaseLayout.astro:1066`): `sparkle(clickX, clickY, 18)` $\rightarrow 18 + 6 =$ **24 DOM nodes**.
   - Stamp Entrance on Scroll (`BaseLayout.astro:521`): `sparkle(..., 14)` $\rightarrow 14 + 5 =$ **19 DOM nodes**.
   - Seal Triple-Tap (`index.astro:249`): `sparkle(..., 24)` $\rightarrow 24 + 8 =$ **32 DOM nodes**.
   - Title Melt Egg (`index.astro:214`): `sparkle(..., 9)` $\rightarrow 9 + 3 =$ **12 DOM nodes per character**.
3. **Timer and Event Loop Flood**:
   - For a single click (24 particles):
     - 24 `setTimeout` calls for transition start delay (`delay` = 0–60ms).
     - 24 `requestAnimationFrame` calls nested inside timeouts.
     - 24 `setTimeout` calls for element removal (`1100ms` - `1300ms`).
     - Total: **48 timer callbacks + 24 rAF callbacks per click**.
   - A user double-clicking or rapid clicking 4 times generates **96 DOM nodes and 192 timers**.
4. **Compositing & Filter Blur Cost**:
   - Each particle animates:
     `filter: blur(0.3px) -> filter: blur(2.5px)` alongside `box-shadow` and `opacity`.
   - Splotches animate `filter: blur(1.6px) -> filter: blur(4px)` over radial gradients.
   - Unlike `transform` and `opacity` (which are composite-only properties), animating `filter: blur()` forces rasterization on every frame unless promoted to individual GPU composited layers. If promoted, 24 individual GPU layer textures are allocated and uploaded; if unpromoted, it forces continuous main-thread repaints.
5. **Astro Navigation Timer Leak**:
   - In `BaseLayout.astro`, `window[cleanupKey]` does NOT clear the pending `setTimeout` IDs created by `sparkle()`.
   - When a user clicks a link and navigates to another page, the 48 pending timers still trigger in the background, attempting to mutate and remove detached nodes.

---

### 3.2 GSAP ScrollTrigger Stamp Splash Replay (`BaseLayout.astro`)

Lines 518–544:
```javascript
518:       function splashAt(el) {
519:         if (typeof window.__inkSplash !== 'function') return;
520:         const rect = el.getBoundingClientRect();
521:         window.__inkSplash(rect.left + rect.width / 2, rect.top + rect.height / 2, 14);
522:       }
...
540:             onStart: () => { gsap.delayedCall(0.2, () => splashAt(el)); },
```
- Stamp elements (such as `.home-stat` cards) trigger `splashAt(el)` whenever they animate in.
- Because GSAP ScrollTrigger is configured for bidirectional replay on scroll up and scroll down:
  - Scrolling down past stats triggers 19 DOM particles.
  - Scrolling back up and down re-triggers another 19 DOM particles.
  - High-frequency scrolling across stamp cards causes repeated bursts of DOM insertion, layout recalculation, and blur animation while the user is scrolling, introducing frame drops (jank) into Lenis smooth scrolling.

---

### 3.3 Ambient Dust Background Canvas (`BaseLayout.astro`)

In `src/layouts/BaseLayout.astro:1089-1167`:
```javascript
1089:         const canvas = document.createElement('canvas');
1090:         canvas.dataset.ambientCanvas = 'true';
...
1104:         function resizeCanvas() {
1105:           viewportWidth = canvas.width = window.innerWidth;
1106:           viewportHeight = canvas.height = window.innerHeight;
1107:         }
...
1113:           const dots = [];
1114:           const dotCount = 32;
...
1135:           function drawDots(time) {
1136:             ctx.clearRect(0, 0, viewportWidth, viewportHeight);
1137: 
1138:             for (const dot of dots) {
1139:               dot.x += dot.dx + Math.sin(time * 0.0005 + dot.phase) * 0.15;
1140:               dot.y += dot.dy + Math.cos(time * 0.0004 + dot.phase) * 0.1;
...
1149:               ctx.beginPath();
1150:               ctx.arc(dot.x, dot.y, dot.r * pulse, 0, Math.PI * 2);
1151:               ctx.fillStyle = dot.color;
1152:               ctx.fill();
1153: 
1154:               ctx.beginPath();
1155:               ctx.arc(dot.x, dot.y, dot.r * pulse * 2.5, 0, Math.PI * 2);
1156:               const gradient = ctx.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, dot.r * pulse * 2.5);
1157:               gradient.addColorStop(0, dot.color);
1158:               gradient.addColorStop(1, 'transparent');
1159:               ctx.fillStyle = gradient;
1160:               ctx.fill();
1161:             }
1162: 
1163:             ambientFrame = requestAnimationFrame(drawDots);
1164:           }
1165: 
1166:           ambientFrame = requestAnimationFrame(drawDots);
```

#### Detailed Findings:
1. **Critical Memory Allocation: Radial Gradients in rAF Loop**:
   - Lines 1156–1158 allocate a new `CanvasGradient` object via `ctx.createRadialGradient(...)` and add two color stops on **every single dot, on every single frame**.
   - Calculation:
     $$\text{Gradients per second (60Hz)} = 32 \text{ dots} \times 60 \text{ frames} = \mathbf{1,920 \text{ gradients/sec}}$$
     $$\text{Gradients per second (120Hz)} = 32 \text{ dots} \times 120 \text{ frames} = \mathbf{3,840 \text{ gradients/sec}}$$
     $$\text{Color Stops per second (120Hz)} = 3,840 \times 2 = \mathbf{7,680 \text{ allocations/sec}}$$
   - This causes constant V8 minor GC (Scavenger) runs. Radial gradients in 2D canvas are not free—the graphics backend must recalculate the radial rasterization lookup tables on every draw call.
2. **100% Continuous Unconditional Execution**:
   - `drawDots` has no throttle, no sleep mode, and no check for whether the window is currently being scrolled or interacted with.
   - It runs perpetually from page load to page teardown.
3. **Ignores DPR**:
   - `canvas.width = window.innerWidth` (1x CSS).
   - On a 2x or 3x Retina display, the browser hardware-scales this 1x canvas to fill the screen, making the ambient dots appear softly blurred.

---

### 3.4 Multi-Canvas Layering & Compositor Stack

When any page in the application is rendered:
```
[Z-Index 100006] DOM Splash Particles (24 live divs with filter: blur)
[Z-Index 100005] Canvas #inkCanvas (Fullscreen 100vw x 100vh, uncapped DPR, spring ribbon + cursor)
[Z-Index 99]     Floating UI / Sidebar Controls
[Z-Index 1]      Main Page Content (Articles, Text, Code Blocks, Mermaid SVG diagrams)
[Z-Index 0]      Canvas [data-ambient-canvas] (Fullscreen fixed, 32 animated gradient dots)
```

#### Compositing Impact:
- The browser must maintain **two concurrent full-screen fixed hardware-accelerated canvas layers**: one behind all content (`z-index: 0`) and one above all content (`z-index: 100005`).
- In addition, whenever clicks or scroll stamp entrances occur, dozens of translucent DOM elements with blur filters are inserted at `z-index: 100006`.
- Every frame of scrolling requires the GPU to composite these two full-screen texture layers over the intermediate content layer, multiplying GPU fill-rate bandwidth.

---

## 4. Cross-System Architectural Comparison

| Dimension | `Header.astro` (`#inkCanvas`) | `BaseLayout.astro` (`data-ambient-canvas`) | `BaseLayout.astro` (`sparkle`) | `PostTransition.astro` (`data-post-canvas`) | `SiteIntro.astro` (`data-intro-canvas`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Technology** | Canvas 2D | Canvas 2D | Pure DOM `<div>` elements | Canvas 2D | Canvas 2D (Offscreen + Onscreen) |
| **DPR Strategy** | Uncapped raw `devicePixelRatio` | Ignored (`1.0`) | N/A (CSS px) | Clamped `Math.min(dpr, 2)` | Clamped `Math.min(dpr, 2)` |
| **Loop Policy** | Continuous while mouse inside window | 100% Continuous always | N/A (CSS transitions + setTimeout) | Demand-driven (GSAP tween) | Fixed-step physics during intro only |
| **Allocation per frame** | 1 `InkPoint` + Array filter allocation | 32 `createRadialGradient` + 64 color stops | 24 divs + 48 timeouts per trigger | Zero (static 48 droplets array) | Pre-allocated typed arrays (`Float32Array`) |
| **Main-Thread Risk** | High (`ctx.shadowBlur = 2` + JSON theme reads) | High (3,840 gradient allocations/sec) | High (Filter blur + forced reflow) | Low (Runs only during transition) | Low (Kills loop and drops canvas on complete) |
| **Astro VT Cleanup** | Flawed: Leaks anonymous resize listener | Clean: `AbortController` + `cancelAnimationFrame` | Flawed: In-flight timeouts leak across page swap | Clean: Clears context on finish | Clean: Full `teardown()` abort |

---

## 5. Mobile Touch & Battery / Thermal Profile Assessment

### 5.1 Mobile Touch Breakdown
1. **Ineffective `isMobile` Guard in `Header.astro`**:
   - As identified in Section 2.4, `isMobile` is updated via matchMedia but **never queried**.
   - When a mobile user scrolls an article:
     - Touching the screen emits `pointerdown` and `pointermove`.
     - `#inkCanvas` begins drawing at `mouse.x, mouse.y`.
     - When the finger lifts (`pointerup`), `onPointerLeave` is **NOT fired** on mobile Safari or Android Chrome.
     - Consequently, `brush.isVisible` remains `true` indefinitely on mobile after the first touch!
     - The rAF loop remains active in the background, executing `ctx.clearRect` on an 1170x2532 canvas at 120Hz on iPhone Pro displays!
2. **Mobile Thermal Throttling & Battery Drain**:
   - Both `#inkCanvas` and `data-ambient-canvas` run concurrently on mobile devices.
   - Together with high-resolution article scrolling (especially on articles with code blocks and Mermaid diagrams), this causes sustained GPU load.
   - On iOS Safari, prolonged dual-canvas rAF execution causes the device to heat up, triggering iOS thermal management to drop screen refresh from 120Hz to 60Hz or lower.

---

## 6. Actionable Low-Overhead Remediation Recommendations (Zero Code Changes Applied)

*Note: In accordance with the strict audit mandate, no code changes have been made to the repository. The following concrete solutions are formulated for downstream implementation.*

---

### Recommendation 1: Fix the `#inkCanvas` Idle Sleep Condition
**File**: `src/components/Header.astro:244-248`

**Issue**: The loop never stops when the mouse is stationary because `brush.isVisible` remains `true`.

**Proposed Implementation**:
Track stationary idle frames or check if the brush is at rest:
```javascript
// Before:
if (!brush.isVisible && points.length === 0) {
  isDrawing = false;
} else if (isDrawing) {
  requestAnimationFrame(updateAndDraw);
}

// Proposed Fix:
const isBrushAtRest = Math.hypot(brush.vx, brush.vy) < 0.05 && Math.hypot(mouse.x - brush.x, mouse.y - brush.y) < 0.5;
if (points.length === 0 && (!brush.isVisible || isBrushAtRest)) {
  isDrawing = false;
} else if (isDrawing) {
  requestAnimationFrame(updateAndDraw);
}
```
*Effect*: When the user stops moving the cursor, the trail fades out within ~1s, draws the stationary cursor circle once, and suspends the rAF loop completely, reducing idle CPU/GPU usage to 0%.

---

### Recommendation 2: Clamp DPR and Debounce Resize on `#inkCanvas`
**File**: `src/components/Header.astro:140-148`

**Issue**: Uncapped DPR allocates 60MB+ VRAM on Retina screens; unthrottled resize causes memory churn.

**Proposed Implementation**:
```javascript
function resize() {
  if (!canvas) return;
  // Clamp DPR to max 2.0 to prevent runaway VRAM consumption on 3x mobile / 4K screens
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
```

---

### Recommendation 3: Eliminate `ctx.shadowBlur` and Cache Theme Strings
**File**: `src/components/Header.astro:155-157, 224-232`

**Issue**: `shadowBlur = 2` triggers Gaussian blur passes per frame; theme DOM reading and string splitting on every tick causes GC churn.

**Proposed Implementation**:
1. Cache `baseR, baseG, baseB` in an outer variable updated via a `MutationObserver` on `data-theme` or theme toggle events, eliminating per-frame DOM queries and string allocations.
2. Remove `ctx.shadowBlur = 2; ctx.shadowBlur = 0;`. Simulate edge softness by drawing a second translucent outer polygon with 1.2x normal width, which executes on the fast fill pipeline without Gaussian convolution passes.

---

### Recommendation 4: Fix Listener Leak in `Header.astro`
**File**: `src/components/Header.astro:338-349`

**Issue**: Anonymous resize listener is not in `cleanupFns`, leaking on every Astro navigation.

**Proposed Implementation**:
```javascript
// Register as named function or include in cleanup:
const onCheckMobile = () => {
  isMobile = !window.matchMedia('(pointer: fine)').matches;
};
window.addEventListener('resize', onCheckMobile);
cleanupFns.push(() => window.removeEventListener('resize', onCheckMobile));
```
Furthermore, utilize `isMobile` to completely bypass `#inkCanvas` initialization on touch-only devices:
```javascript
if (isMobile) return; // Completely disable inkCanvas on mobile touch devices
```

---

### Recommendation 5: Pre-Allocate or Pool Ambient Canvas Radial Gradients
**File**: `src/layouts/BaseLayout.astro:1154-1160`

**Issue**: 1,920 to 3,840 `createRadialGradient` allocations per second.

**Proposed Implementation**:
Render the soft radial dot once into a tiny offscreen cache canvas (e.g. 32x32 pixels) during initialization:
```javascript
// Pre-render gradient sprite once:
const spriteCanvas = document.createElement('canvas');
spriteCanvas.width = 32;
spriteCanvas.height = 32;
const sctx = spriteCanvas.getContext('2d');
// draw radial gradient into spriteCanvas once ...

// In drawDots loop: replace createRadialGradient with drawImage:
ctx.drawImage(spriteCanvas, dot.x - dot.r * 2.5, dot.y - dot.r * 2.5, dot.r * 5, dot.r * 5);
```
*Effect*: Completely eliminates 3,840 object allocations per second, converting expensive radial math into fast hardware blits.

---

### Recommendation 6: Convert DOM `sparkle` to Canvas-Driven Particle Pool
**File**: `src/layouts/BaseLayout.astro:932-1033`

**Issue**: 24 DOM elements, 48 timers, and CSS `filter: blur` per click.

**Proposed Implementation**:
Instead of creating `<div>` elements, draw splash particles directly into a dedicated lightweight particle canvas (or recycle `#inkCanvas` if present), using a pre-allocated typed array pool of 64 particles:
- Fixed structure: `Float32Array(64 * 6)` (`x, y, vx, vy, life, maxLife`).
- Zero DOM manipulation, zero CSS filter recalculation, zero `setTimeout` calls.
- Inactive when particle pool is empty.

---

## 7. Conclusion

The Canvas Ink Brush and Particle Splash systems deliver a rich aesthetic but suffer from **two critical architectural flaws**:
1. **Perpetual Animation Loops**: Both `#inkCanvas` (due to an inverted visibility check) and `data-ambient-canvas` (unconditional loop) run continuously when the user is completely idle, generating continuous CPU/GPU wake locks and rendering two full-screen layers over all content.
2. **Allocation Churn on Every Tick**: The ambient canvas allocates up to **3,840 `CanvasGradient` objects per second**, while the click splash system floods the DOM with up to **24 `<div>` elements and 48 timers per click** with expensive CSS `filter: blur` animations.

By implementing the targeted remedies outlined above (clamping DPR to 2.0, pausing rAF loops when idle, replacing per-frame gradients with sprite blitting, and cleaning up navigation listeners), the site's idle power consumption can be reduced to near-zero and scrolling smoothness can be restored across both desktop and mobile devices.
