# Project: Animation Performance & Graphics Audit

## Architecture
Comprehensive, read-only performance audit of client-side animations, scroll choreography, and interactive graphics across desktop and mobile environments for the blog codebase.

### Core Modules Audited:
1. **Scroll Choreography & Page Transitions**:
   - `src/layouts/BaseLayout.astro`: GSAP ScrollTrigger, Lenis smooth scrolling integration, `data-enter` choreography, scroll direction detection (`html[data-scroll-dir]`), reading progress bar.
   - `src/layouts/PostLayout.astro`: Article section `IntersectionObserver` (`.pr` / `.is-in`), reading progress spine dots layout, TOC active heading tracking.
2. **Interactive Graphics & Canvas**:
   - `src/components/Header.astro`: Fullscreen `#inkCanvas` ribbon brush simulation, pointer tracking, DPR scaling, rAF rendering loop.
   - `src/layouts/BaseLayout.astro`: Ambient background canvas (`data-ambient-canvas`) radial gradients, click particle splash system (`sparkle()`), stamp card scroll splashes.
3. **SVG Graphics & Diagram Engine**:
   - `src/components/MermaidRenderer.astro`: Client-side Mermaid diagram rendering, SVG node and edge stroke animations, inline zoom/pan, full-screen interactive modal.
   - `astro.config.mjs`: `remarkMermaid` AST plugin skeleton generation.
4. **CSS Rendering Pipeline**:
   - `src/styles/global.css`: Transitions, keyframes, `will-change` layer allocations, `clip-path`, `filter: blur()`, CSS transform transitions.
5. **Cross-Engine & Cross-Device Behavior**:
   - Chromium Blink (Desktop/Android) vs Apple WebKit (macOS Safari / iOS WebKit).
   - High-refresh rate displays (120Hz/165Hz) vs low-power mobile devices.

---

## Feature Inventory
| # | Feature / Area | Description | Milestone | Source |
|---|----------------|-------------|-----------|--------|
| F1 | GSAP ScrollTrigger & Choreography | Page enter animations, route swap lifecycle, `gsap.ticker` rAF binding, listener leaks | M1 | Survey 1 (DONE) |
| F2 | PostLayout IntersectionObserver Replay | Article section `.pr` entry/exit, bidirectional `classList.toggle('is-in')`, 68px direction jump | M1 | Survey 1 (DONE) |
| F3 | Canvas Ink Brush & Ambient Graphics | `#inkCanvas` perpetual rAF loop, uncapped DPR VRAM, radial gradient allocation churn, DOM particle floods | M1 | Survey 2 (DONE) |
| F4 | Mermaid SVG & Modal Zoom/Pan | Client serial rendering, SVG stroke animation timing, modal 60ms transform transition lag, inline stage pan | M1 | Survey 3 (DONE) |
| F5 | Lenis Smooth Scroll Engine | Damping, wheel/touch event interception (`passive: false`), main thread vs compositor interactions | M1 | Survey 1 (DONE) |
| F6 | CSS Pipeline: Layout, Paint & Composite | Properties (`opacity`, `transform`, `clip-path`, `filter`), scroll reflows (`bar.style.width`), forced synchronous layouts | M2 | Survey 1, 3 (DONE) |
| F7 | Layer Explosion & VRAM Budget | Character-level split title `will-change`, permanent SVG `will-change`, canvas buffer VRAM footprints | M2 | Survey 2, 3 (DONE) |
| F8 | Cross-Device & Cross-Engine Disparity | Blink vs WebKit, desktop GPU vs mobile SoC, thermal throttling, touch handling vs mouse | M2 | Survey 2, 3 (DONE) |
| F9 | Long Article Inertial Scroll Jank | High-frequency scrolling stress with dozens of code blocks, images, and Mermaid diagrams | M3 | Survey 1, 3 (DONE) |
| F10 | Rapid Bidirectional Scroll Thrashing | `is-in` toggle thrashing, conflicting 1.5s CSS transitions, GPU texture invalidations | M3 | Survey 1 (DONE) |
| F11 | Mermaid Modal Zoom/Pan Memory & Repaint | High-zoom SVG rasterization, matrix transformations, touch gesture support | M3 | Survey 3 (DONE) |
| F12 | Once vs Replay Comparative Analysis | Theoretical & architectural trade-offs between one-shot admission and bidirectional re-entry | M4 | Survey 1 (DONE) |
| F13 | Master Audit Report Assembly | Assembly of comprehensive, evidence-based 《动效性能深度分析与评测报告》 with bottleneck ratings | M4 | Worker (DONE) |
| F14 | Actionable Low-Overhead Remediation Plan | Code-accurate optimization proposals without breaking visual aesthetics or UX | M4 | Worker (DONE) |
| F15 | Multi-Agent Review & Forensic Audit Gate | Reviewers, Challengers, and Forensic Auditor verification ensuring strict zero code modifications | M5 | Audit Taskforce (DONE) |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Survey & Architecture Mapping | Survey 3 explorers to map complete animation pipeline | none | DONE |
| M1 | R1 Full Animation Pipeline Deep Audit | Comprehensive audit of 5 core animation systems: GSAP, PostLayout IO, Canvas Ink, Mermaid, Lenis | M0 | DONE |
| M2 | R2 Rendering Pipeline & Cross-Device Analysis | Detailed analysis of CSS properties, Blink vs WebKit, VRAM layer explosion, GPU impacts | M1 | DONE |
| M3 | R3 Stress Scenarios & Interaction Pressure | Long article inertial scroll jank, bidirectional rapid replay thrashing, Mermaid modal zoom/pan stress | M2 | DONE |
| M4 | R4 Master Audit Report Assembly | Production of 《动效性能深度分析与评测报告》 in `.agents/reports/` with ratings, line numbers, and fixes | M3 | DONE |
| M5 | Multi-Agent Gate & Forensic Integrity Verification | 2 Reviewers, 2 Challengers, and 1 Forensic Auditor verifying correctness, completeness, and 0 code edits | M4 | DONE |

---

## Code Layout (Strict Read-Only Audit Scope)
- Source files audited:
  - `src/layouts/BaseLayout.astro`
  - `src/layouts/PostLayout.astro`
  - `src/components/Header.astro`
  - `src/components/MermaidRenderer.astro`
  - `src/components/SiteIntro.astro`
  - `src/components/PostTransition.astro`
  - `src/styles/global.css`
  - `astro.config.mjs`
  - `node_modules/lenis/dist/lenis.mjs`
- Audit Artifacts & Reports:
  - `.agents/PROJECT.md`
  - `.agents/orchestrator_1/`
  - `.agents/reports/ANIMATION_PERFORMANCE_AUDIT_REPORT.md` (Master Report)
  - `.agents/reports/`
  - `.agents/explorer_survey_1/`
  - `.agents/explorer_survey_2/`
  - `.agents/explorer_survey_3/`
  - `.agents/worker_report/`
  - `.agents/reviewer_1/`
  - `.agents/reviewer_2/`
  - `.agents/challenger_1/`
  - `.agents/challenger_2/`
  - `.agents/auditor_1/`

---

## Final Gate Summary
- **Gate Status**: PASS (Unanimous approval across Reviewers, Challengers, and Forensic Auditor)
- **Zero Code Modifications**: Certified CLEAN (zero files altered outside `.agents/`, zero new commits, build passes with exit code 0).
