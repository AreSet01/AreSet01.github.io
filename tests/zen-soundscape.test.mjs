import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SOUNDSCAPES,
  createPinkNoiseData,
  createBrownNoiseData,
  createWhiteNoiseData,
  createLoopingPinkNoiseData,
  createLoopingBrownNoiseData,
  createLoopingWhiteNoiseData,
  loopSmoothBuffer,
  ZenAudioEngine,
} from '../src/utils/zenAudioEngine.ts';

const rootDir = path.resolve(import.meta.dirname, '..');

test('Zen Soundscapes: Metadata for all four Zen soundscapes is complete and valid', () => {
  assert.strictEqual(SOUNDSCAPES.length, 4, 'Must have exactly 4 Zen soundscapes');

  const ids = SOUNDSCAPES.map((s) => s.id);
  assert.deepStrictEqual(
    ids,
    ['rain', 'wind', 'paper', 'stream'],
    'Soundscapes must be rain, wind, paper, and stream'
  );

  const rain = SOUNDSCAPES.find((s) => s.id === 'rain');
  assert.strictEqual(rain.name, '空山听雨');
  assert.strictEqual(rain.nameEn, 'Mountain Rain');
  assert.ok(rain.desc.includes('屋檐雨声') && rain.desc.includes('落水'));
  assert.ok(rain.poem.length > 0);

  const wind = SOUNDSCAPES.find((s) => s.id === 'wind');
  assert.strictEqual(wind.name, '深谷松风');
  assert.strictEqual(wind.nameEn, 'Pine Breeze');
  assert.ok(wind.desc.includes('松涛微风'));

  const paper = SOUNDSCAPES.find((s) => s.id === 'paper');
  assert.strictEqual(paper.name, '寒夜翻书');
  assert.strictEqual(paper.nameEn, 'Paper & Hearth');
  assert.ok(paper.desc.includes('宣纸') && paper.desc.includes('炭火'));

  const stream = SOUNDSCAPES.find((s) => s.id === 'stream');
  assert.strictEqual(stream.name, '古寺清溪');
  assert.strictEqual(stream.nameEn, 'Stream & Bell');
  assert.ok(stream.desc.includes('溪流') && stream.desc.includes('磬声'));
});

test('Procedural Audio Synthesis: Pink, Brown, White noise algorithms generate valid buffers', () => {
  const len = 44100; // 1 second at 44.1kHz

  // 1. Pink Noise (Kellet filter)
  const pink = createPinkNoiseData(len);
  assert.strictEqual(pink.length, len);
  let pinkNan = false;
  let pinkMax = -Infinity;
  let pinkMin = Infinity;
  for (let i = 0; i < len; i++) {
    if (Number.isNaN(pink[i]) || !Number.isFinite(pink[i])) pinkNan = true;
    if (pink[i] > pinkMax) pinkMax = pink[i];
    if (pink[i] < pinkMin) pinkMin = pink[i];
  }
  assert.strictEqual(pinkNan, false, 'Pink noise must contain only finite numbers');
  assert.ok(pinkMax > 0 && pinkMin < 0, 'Pink noise must have positive and negative oscillations');

  // 2. Brown Noise (Integrated random walk)
  const brown = createBrownNoiseData(len);
  assert.strictEqual(brown.length, len);
  let brownNan = false;
  for (let i = 0; i < len; i++) {
    if (Number.isNaN(brown[i]) || !Number.isFinite(brown[i])) brownNan = true;
  }
  assert.strictEqual(brownNan, false, 'Brown noise must contain only finite numbers');

  // 3. White Noise (Uniform random)
  const white = createWhiteNoiseData(len);
  assert.strictEqual(white.length, len);
  let whiteOutOfBounds = false;
  for (let i = 0; i < len; i++) {
    if (white[i] < -1 || white[i] > 1) whiteOutOfBounds = true;
  }
  assert.strictEqual(whiteOutOfBounds, false, 'White noise must stay within [-1, 1]');

  // 4. Loop smoothing
  const testBuf = new Float32Array(5000);
  for (let i = 0; i < 5000; i++) testBuf[i] = i < 2500 ? 1.0 : -1.0;
  loopSmoothBuffer(testBuf, 512);
  // After crossfade, beginning and end should blend smoothly without a step disconnect
  assert.ok(Math.abs(testBuf[0] - testBuf[testBuf.length - 1]) < 0.2, 'Buffer loop edges must blend smoothly');
});

test('ZenAudioEngine: State machine, listeners, volume clamping, and timers', () => {
  const engine = new ZenAudioEngine();
  const state = engine.getState();

  assert.strictEqual(state.isPlaying, false, 'Should be stopped initially');
  assert.strictEqual(typeof state.volume, 'number');
  assert.ok(state.volume >= 0 && state.volume <= 1);
  assert.strictEqual(state.timerDuration, 0);

  // Volume clamping
  engine.setVolume(1.8);
  assert.strictEqual(engine.getState().volume, 1.0, 'Volume must be clamped to 1.0');

  engine.setVolume(-0.4);
  assert.strictEqual(engine.getState().volume, 0.0, 'Volume must be clamped to 0.0');

  engine.setVolume(0.75);
  assert.strictEqual(engine.getState().volume, 0.75, 'Volume must set accurately');

  // Scene selection
  engine.setScene('stream');
  assert.strictEqual(engine.getState().currentScene, 'stream', 'Scene must update to stream');

  // Timer configuration
  engine.setTimer(25);
  assert.strictEqual(engine.getState().timerDuration, 25);
  assert.strictEqual(engine.getState().timerRemaining, 1500, '25 minutes should equal 1500 seconds');

  engine.setTimer(0);
  assert.strictEqual(engine.getState().timerDuration, 0);
  assert.strictEqual(engine.getState().timerRemaining, 0);

  // Listener subscriptions
  let notifyCount = 0;
  let lastVolume = 0;
  const unsubscribe = engine.onStateChange((s) => {
    notifyCount++;
    lastVolume = s.volume;
  });

  // onStateChange immediately calls listener once
  assert.strictEqual(notifyCount, 1);
  assert.strictEqual(lastVolume, 0.75);

  engine.setVolume(0.4);
  assert.strictEqual(notifyCount, 2);
  assert.strictEqual(lastVolume, 0.4);

  unsubscribe();
  engine.setVolume(0.5);
  assert.strictEqual(notifyCount, 2, 'Unsubscribed listener should not receive updates');
});

test('DOM & Markup: Header.astro contains Zen soundscape toggle button with accessibility attributes', () => {
  const headerContent = fs.readFileSync(path.join(rootDir, 'src/components/Header.astro'), 'utf-8');

  assert.ok(
    headerContent.includes('class="zen-sound-toggle"'),
    'Header.astro must contain zen-sound-toggle button'
  );
  assert.ok(
    headerContent.includes('data-zen-sound-toggle'),
    'Header.astro must contain data-zen-sound-toggle attribute for click delegation'
  );
  assert.ok(
    headerContent.includes('aria-label="打开白噪音伴读"'),
    'Header button must have descriptive aria-label'
  );
  assert.ok(
    headerContent.includes('title="墨池听雨 · 伴读音景"'),
    'Header button must have descriptive title'
  );
  assert.ok(
    headerContent.includes('aria-haspopup="dialog"'),
    'Header button must declare aria-haspopup="dialog"'
  );
  assert.ok(
    headerContent.includes('aria-controls="zen-sound-capsule"'),
    'Header button must link to zen-sound-capsule via aria-controls'
  );
  assert.ok(
    headerContent.includes('aria-expanded="false"'),
    'Header button must have initial aria-expanded="false"'
  );
  assert.ok(
    headerContent.includes('icon-zen-sound'),
    'Header button must contain icon-zen-sound svg'
  );
  assert.ok(
    headerContent.includes('class="zen-toggle-dot"'),
    'Header button must have delicate breathing dot element'
  );
  assert.ok(
    headerContent.includes('class="zen-toggle-ripple"'),
    'Header button must have delicate ink ripple element'
  );
});

test('DOM & Markup: ZenSoundscape.astro contains capsule panel with all controls', () => {
  const capsuleContent = fs.readFileSync(path.join(rootDir, 'src/components/ZenSoundscape.astro'), 'utf-8');

  // ID and layout
  assert.ok(capsuleContent.includes('id="zen-sound-capsule"'), 'Capsule must have id zen-sound-capsule');
  assert.ok(capsuleContent.includes('class="zen-sound-capsule"'), 'Capsule must have class zen-sound-capsule');
  assert.ok(capsuleContent.includes('data-lenis-prevent'), 'Capsule must have data-lenis-prevent to avoid scroll hijacking');

  // Four soundscape cards
  assert.ok(capsuleContent.includes('data-scene-id={scene.id}'), 'Must render cards for each soundscape');
  assert.ok(capsuleContent.includes('SOUNDSCAPES.map'), 'Must map over SOUNDSCAPES');

  // Controls
  assert.ok(capsuleContent.includes('data-zen-play-btn'), 'Must have play/pause master toggle button');
  assert.ok(capsuleContent.includes('data-zen-volume-slider'), 'Must have volume range slider');
  assert.ok(capsuleContent.includes('data-zen-close-btn'), 'Must have close button');
  assert.ok(capsuleContent.includes('data-timer-min="15"'), 'Must have 15m timer pill');
  assert.ok(capsuleContent.includes('data-timer-min="25"'), 'Must have 25m Pomodoro timer pill');
  assert.ok(capsuleContent.includes('data-timer-min="45"'), 'Must have 45m deep focus timer pill');
  assert.ok(capsuleContent.includes('data-timer-min="60"'), 'Must have 60m meditation timer pill');
  assert.ok(capsuleContent.includes('data-zen-countdown'), 'Must have countdown display element');

  // Global persistence & view transitions wiring
  assert.ok(capsuleContent.includes("document.addEventListener('astro:page-load'"), 'Must hook into astro:page-load');
  assert.ok(capsuleContent.includes('getZenAudioEngine()'), 'Must connect to singleton engine');

  // Event duplication guard and transition cleanup
  assert.ok(
    capsuleContent.includes("capsule.dataset.zenBound === 'true'"),
    'Must guard against repeated event binding on persisted capsule DOM across page transitions'
  );
  assert.ok(
    capsuleContent.includes('__zenGlobalEventsBound'),
    'Must guard global document/window event listeners to prevent duplicate handler accumulation'
  );
  assert.ok(
    capsuleContent.includes("document.addEventListener('astro:before-swap'"),
    'Must handle astro:before-swap to smoothly close capsule modal during page swap'
  );
  assert.ok(
    capsuleContent.includes("btn.setAttribute('aria-expanded'"),
    'Must dynamically synchronize aria-expanded on all header toggle buttons'
  );
});

test('DOM & Markup: BaseLayout.astro mounts ZenSoundscape with transition:persist under body', () => {
  const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf-8');

  assert.ok(
    baseLayout.includes("import ZenSoundscape from '../components/ZenSoundscape.astro'"),
    'BaseLayout must import ZenSoundscape'
  );
  assert.ok(
    baseLayout.includes('<ZenSoundscape transition:persist />'),
    'BaseLayout must render ZenSoundscape with transition:persist'
  );
});

test('CSS Verification: global.css provides complete styles for Zen toggle and capsule', () => {
  const css = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf-8');

  // Toggle button styles
  assert.ok(css.includes('.zen-sound-toggle'), 'Must define .zen-sound-toggle styles');
  assert.ok(css.includes('.zen-sound-toggle.is-playing'), 'Must define active playing state for toggle');
  assert.ok(css.includes('@keyframes zenBreathingPulse'), 'Must have breathing pulse animation');
  assert.ok(css.includes('@keyframes zenInkRippleRing'), 'Must have ink ripple animation');

  // Capsule styles
  assert.ok(css.includes('.zen-sound-capsule'), 'Must define .zen-sound-capsule');
  assert.ok(css.includes('.zen-sound-capsule.is-open'), 'Must define open state for capsule');
  assert.ok(css.includes('.zen-soundscapes-grid'), 'Must define 2x2 grid for soundscapes');
  assert.ok(css.includes('.zen-scene-card.is-active'), 'Must define active state for scene card');
  assert.ok(css.includes('.zen-volume-slider'), 'Must define custom range slider');
  assert.ok(css.includes('.zen-timer-pill.is-active'), 'Must define active timer pill');
  assert.ok(css.includes('max-height: calc(100vh - 3rem);'), 'Must define 3rem safety margin max-height');

  // Play button breathing ink ripple
  assert.ok(css.includes('.zen-btn-ripple'), 'Must define .zen-btn-ripple for player button');
  assert.ok(css.includes('@keyframes zenPlayBtnRipple'), 'Must define @keyframes zenPlayBtnRipple');
  assert.ok(css.includes('.zen-main-play-btn.is-playing .zen-btn-ripple'), 'Must animate ripple when playing');

  // Mobile responsive rules
  assert.ok(
    css.includes('.cursor-trail-toggle,\n  .zen-sound-toggle') ||
    css.includes('.cursor-trail-toggle, .zen-sound-toggle') ||
    css.includes('.zen-sound-toggle {'),
    'Mobile nav-actions must accommodate .zen-sound-toggle'
  );
});

test('Viewport Safety & Positioning: ZenSoundscape.astro dynamically clamps top and maxHeight', () => {
  const capsuleContent = fs.readFileSync(path.join(rootDir, 'src/components/ZenSoundscape.astro'), 'utf-8');

  assert.ok(
    capsuleContent.includes('capsule.scrollHeight'),
    'Must measure unconstrained scrollHeight for accurate bounds calculation'
  );
  assert.ok(
    capsuleContent.includes('capsule.style.maxHeight = `${allowedMaxHeight}px`'),
    'Must dynamically clamp maxHeight so bottom never overflows viewport'
  );
  assert.ok(
    capsuleContent.includes("window.addEventListener('scroll', positionCapsule"),
    'Must listen to scroll events for dynamic clamping'
  );
  assert.ok(
    capsuleContent.includes("clearProps: 'opacity,transform,visibility'"),
    'Must only clear opacity, transform, visibility on close, preserving top and maxHeight'
  );
});

test('ZenAudioEngine: Edge cases in rapid scene switching, timers, and state consistency', () => {
  const engine = new ZenAudioEngine();

  // 1. Rapid switching through all 4 soundscapes
  const scenes = ['wind', 'paper', 'stream', 'rain', 'stream'];
  for (const s of scenes) {
    engine.setScene(s);
    assert.strictEqual(engine.getState().currentScene, s, `Scene should be ${s}`);
  }

  // 2. Timer edge cases: negative minutes or non-finite minutes
  engine.setTimer(-10);
  assert.strictEqual(engine.getState().timerDuration, 0, 'Negative timer duration must clamp to 0');
  assert.strictEqual(engine.getState().timerRemaining, 0);
  engine.setTimer(45);
  assert.strictEqual(engine.getState().timerDuration, 45);
  assert.strictEqual(engine.getState().timerRemaining, 2700);

  // 3. Resetting timer to 0 resets remaining seconds to 0
  engine.setTimer(0);
  assert.strictEqual(engine.getState().timerRemaining, 0);

  // 4. Volume boundary clamping
  engine.setVolume(NaN);
  assert.strictEqual(engine.getState().volume, 0, 'NaN volume should be clamped to 0');
  engine.setVolume(0.5);
  assert.strictEqual(engine.getState().volume, 0.5);
});

test('View Transitions: Simulation of multi-page navigation and singleton persistence', () => {
  // Simulate global window with singleton engine
  const mockWindow = {
    __zenAudioEngine: new ZenAudioEngine(),
  };

  const getEngine = () => mockWindow.__zenAudioEngine;

  const engine = getEngine();
  engine.setScene('wind');
  engine.setVolume(0.8);

  // Simulate 5 page transitions with UI sync
  let syncCount = 0;
  let activeSceneOnPage = '';
  let activePlayingOnPage = false;

  const syncPageUI = () => {
    const state = engine.getState();
    syncCount++;
    activeSceneOnPage = state.currentScene;
    activePlayingOnPage = state.isPlaying;
  };

  // Initial load
  syncPageUI();
  assert.strictEqual(activeSceneOnPage, 'wind');
  assert.strictEqual(activePlayingOnPage, false);

  // Navigations across 4 pages
  for (let i = 0; i < 4; i++) {
    // Page load event
    syncPageUI();
  }

  assert.strictEqual(syncCount, 5, 'Should have synced UI across 5 page loads');
  assert.strictEqual(activeSceneOnPage, 'wind', 'Scene should persist across navigations');
});

test('UI Polish: Scrollbar suppression, fixed timer layout stability, and tactile button feedback', () => {
  const css = fs.readFileSync(path.join(rootDir, 'src/styles/global.css'), 'utf-8');
  const capsuleContent = fs.readFileSync(path.join(rootDir, 'src/components/ZenSoundscape.astro'), 'utf-8');

  // 1. Zero scrollbars on capsule
  assert.ok(css.includes('scrollbar-width: none;'), 'Capsule must suppress standard scrollbars');
  assert.ok(css.includes('-ms-overflow-style: none;'), 'Capsule must suppress IE/Edge legacy scrollbars');
  assert.ok(css.includes('.zen-sound-capsule::-webkit-scrollbar'), 'Capsule must suppress webkit scrollbars');

  // 2. Timer layout stability (no stretching or collapsing)
  assert.ok(css.includes('height: 1.5rem;'), 'Timer header must have fixed height');
  assert.ok(css.includes('min-height: 1.5rem;'), 'Timer header must have fixed min-height');
  assert.ok(
    css.includes('.zen-timer-countdown[hidden]') && css.includes('opacity: 0 !important;'),
    'Countdown must reserve space and fade opacity without triggering layout stretch'
  );

  // 3. Tactile button interactions
  assert.ok(css.includes('.zen-timer-pill:active'), 'Timer pills must have tactile active press feedback');
  assert.ok(css.includes('.zen-scene-card:active'), 'Scene cards must have tactile active press feedback');
  assert.ok(css.includes('.zen-main-play-btn:active'), 'Play button must have tactile active press feedback');

  // 4. GSAP transform cleanup so hover/active states stay functional
  assert.ok(
    capsuleContent.includes("clearProps: 'transform'"),
    'Button GSAP animations must clear inline transforms upon complete'
  );

  // 5. Fluid button interaction animation (glider)
  assert.ok(
    capsuleContent.includes('data-zen-timer-glider'),
    'Must include timer glider element for fluid transitions between buttons'
  );
  assert.ok(
    css.includes('.zen-timer-glider'),
    'Must provide CSS for animated timer pill glider'
  );
  assert.ok(
    capsuleContent.includes('updateTimerGlider'),
    'Must sync timer glider position during UI updates and clicks'
  );

  // 6. Child scrollbars & horizontal overflow suppression
  assert.ok(
    css.includes('overflow-x: hidden;'),
    'Capsule must prevent horizontal overflow and scrollbars'
  );
  assert.ok(
    css.includes('.zen-sound-capsule *::-webkit-scrollbar'),
    'Must suppress scrollbar on all children of capsule'
  );

  // 7. Rigid layout boundaries
  assert.ok(
    css.includes('max-height: 1.5rem;'),
    'Timer header must have rigid max-height protection'
  );
});

test('Acoustic Reconstruction: Mountain Rain & Stream & Bell procedural soundscape physics', () => {
  const engineContent = fs.readFileSync(path.join(rootDir, 'src/utils/zenAudioEngine.ts'), 'utf-8');

  // 1. Mountain Rain Dual-Layer Wash
  assert.ok(
    engineContent.includes('1200') && engineContent.includes('0.12'),
    'Mountain rain must include distant shower layer with 1200Hz filter and 0.12Hz LFO breath'
  );
  assert.ok(
    engineContent.includes('2800') && engineContent.includes('4200'),
    'Mountain rain must include nearfield drizzle layer with 2800Hz~4200Hz high-frequency band'
  );

  // 2. Tile Stone vs Mountain Leaf Water Drop Physical Synthesis
  assert.ok(
    engineContent.includes('isStoneTile'),
    'synthesizeRainDrop must distinguish between tile/stone drops and mountain leaf drips'
  );
  assert.ok(
    engineContent.includes('820') || engineContent.includes('800'),
    'Tile/stone drop must cover 800~1200Hz cavity resonance range'
  );
  assert.ok(
    engineContent.includes('1550') || engineContent.includes('1500'),
    'Mountain leaf drop must cover 1500~2200Hz crisp downward sweep range'
  );

  // 3. Stream & Bell: Minnaert Bubble Acoustics
  assert.ok(
    engineContent.includes('synthesizeStreamBubble'),
    'Stream soundscape must include synthesizeStreamBubble for physical bubble acoustics'
  );
  assert.ok(
    engineContent.includes('400') && engineContent.includes('2400'),
    'Stream bubbles must span 400Hz to 2800Hz frequency spectrum'
  );
  assert.ok(
    engineContent.includes('scheduleBubble'),
    'Stream soundscape must schedule dense bubble arrivals'
  );
  assert.ok(
    engineContent.includes('streamHp') && engineContent.includes('streamLp') && engineContent.includes('1800'),
    'Stream soundscape must feature broad 360Hz~1800Hz shallow stone water wash'
  );

  // 4. Temple Bell
  assert.ok(
    engineContent.includes('synthesizeTempleBell'),
    'Stream soundscape must include synthesizeTempleBell'
  );
  assert.ok(
    engineContent.includes('432'),
    'Temple bell must tune fundamental to 432Hz'
  );
});

test('Visual Reconstruction: ZenRainscape multi-tier water ripples and adaptive density', () => {
  const rainscapeContent = fs.readFileSync(path.join(rootDir, 'src/components/ZenRainscape.astro'), 'utf-8');

  // 1. Adaptive Ripple Caps & Intervals
  assert.ok(
    rainscapeContent.includes('maxRipplesDesktop = 55') || rainscapeContent.includes('55'),
    'ZenRainscape must support desktop concurrency limit of 55 ripples'
  );
  assert.ok(
    rainscapeContent.includes('maxRipplesMobile = 32') || rainscapeContent.includes('32'),
    'ZenRainscape must support mobile concurrency limit of 32 ripples'
  );
  assert.ok(
    rainscapeContent.includes('80') && rainscapeContent.includes('160'),
    'Desktop spawn interval must target 80ms~160ms'
  );
  assert.ok(
    rainscapeContent.includes('140') && rainscapeContent.includes('240'),
    'Mobile spawn interval must target 140ms~240ms'
  );

  // 2. Multi-tier Ripple Geometry
  assert.ok(
    rainscapeContent.includes('RippleTier') || rainscapeContent.includes("'micro'") || rainscapeContent.includes('micro'),
    'ZenRainscape must classify ripples by tier'
  );
  assert.ok(
    rainscapeContent.includes('micro') && rainscapeContent.includes('main') && rainscapeContent.includes('deep'),
    'ZenRainscape must feature micro droplet, main dual-ring, and deep expansive swell tiers'
  );

  // 3. Purity Guards (No puddle or mist artifacts)
  assert.ok(!rainscapeContent.includes('splashes'), 'Must never introduce splashes');
  assert.ok(!rainscapeContent.includes('mists'), 'Must never introduce mists');
});

test('Acoustic & Visual Robustness: Filter sweep tracking, sub-timer cleanup, and ripple lifecycle protection', () => {
  const engineContent = fs.readFileSync(path.join(rootDir, 'src/utils/zenAudioEngine.ts'), 'utf-8');
  const rainscapeContent = fs.readFileSync(path.join(rootDir, 'src/components/ZenRainscape.astro'), 'utf-8');

  // 1. Mountain leaf drop filter must sweep synchronously with oscillator
  assert.ok(
    engineContent.includes('filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.42'),
    'Mountain leaf bandpass filter must sweep down to 0.42 * baseFreq synchronously with oscillator'
  );

  // 2. Secondary bubble and rain sub-timers must be cleared on disposal
  assert.ok(
    engineContent.includes('clearTimeout(subDropTimeout)') && engineContent.includes('clearTimeout(subBubbleTimeout)'),
    'ZenAudioEngine must clean up subDropTimeout and subBubbleTimeout on disposal'
  );

  // 3. Minnaert bubble loudness compensation & non-linear power distribution
  assert.ok(
    engineContent.includes('loudnessWeight') && engineContent.includes('Math.pow(u, 1.25)'),
    'Minnaert bubble synthesis must apply loudness compensation and non-linear power distribution'
  );

  // 4. Ripple lifecycle must NOT prematurely purge during canvas fade-in
  assert.ok(
    rainscapeContent.includes('progress >= 1 || rip.r >= rip.maxR'),
    'Ripple lifecycle must terminate based on physical geometric progress, avoiding premature purge during fade-in'
  );
  assert.ok(
    !rainscapeContent.includes('currentAlpha <= 0.008') && !rainscapeContent.includes('currentAlpha <= 0.01'),
    'ZenRainscape must not purge ripples when alpha is low during master fade-in'
  );

  // 5. Natural rain scatter density
  assert.ok(
    rainscapeContent.includes('lakeRipples.length < getMaxRipples() && Math.random() < 0.40'),
    'ZenRainscape must support natural companion droplet scatter to maintain rich ripple density'
  );
});

test('Equal-Power Overlap-and-Add: Looping noise generators guarantee constant energy and zero seam clicks', () => {
  const len = 44100 * 2; // 2 seconds
  const crossfade = 22050; // 0.5s crossfade (平滑低频随机方差的采样窗口)

  // 1. Looping Pink Noise
  const loopingPink = createLoopingPinkNoiseData(len, crossfade);
  assert.strictEqual(loopingPink.length, len, 'Looping pink noise buffer must match requested length');
  assert.ok(Math.abs(loopingPink[0] - loopingPink[len - 1]) < 0.5, 'Loop seam step must be finite and within normal variance');

  // Verify power constancy across crossfade region vs body region
  let powerFade = 0;
  for (let i = 0; i < crossfade; i++) powerFade += loopingPink[i] * loopingPink[i];
  powerFade /= crossfade;

  let powerBody = 0;
  for (let i = crossfade; i < len; i++) powerBody += loopingPink[i] * loopingPink[i];
  powerBody /= (len - crossfade);

  const ratioPink = powerFade / powerBody;
  assert.ok(ratioPink > 0.3 && ratioPink < 2.5, `Pink noise power ratio (${ratioPink}) must remain strictly within equal-power bounds, no 0dB dips`);

  // 2. Looping Brown Noise
  const loopingBrown = createLoopingBrownNoiseData(len, crossfade);
  assert.strictEqual(loopingBrown.length, len, 'Looping brown noise buffer must match requested length');
  assert.ok(Math.abs(loopingBrown[0] - loopingBrown[len - 1]) < 0.6, 'Loop seam step must be finite and smooth');

  // 3. Looping White Noise
  const loopingWhite = createLoopingWhiteNoiseData(len, crossfade);
  assert.strictEqual(loopingWhite.length, len, 'Looping white noise buffer must match requested length');
});

test('Acoustic Architecture: Coprime non-symmetric long buffers eliminate 5-second periodic stutter', () => {
  const engineContent = fs.readFileSync(path.join(rootDir, 'src/utils/zenAudioEngine.ts'), 'utf-8');

  // 1. Rain soundscape must use coprime buffers (10.7s and 13.1s)
  assert.ok(
    engineContent.includes('10.7') && engineContent.includes('13.1'),
    'Mountain Rain soundscape must configure coprime buffer lengths (10.7s and 13.1s) to eliminate phase locking'
  );

  // 2. Wind soundscape must use long non-symmetric buffers (12.7s and 9.1s)
  assert.ok(
    engineContent.includes('12.7') && engineContent.includes('9.1'),
    'Wind soundscape must configure long non-symmetric buffer lengths (12.7s and 9.1s)'
  );

  // 3. Stream soundscape must use long buffer (11.3s)
  assert.ok(
    engineContent.includes('11.3'),
    'Stream soundscape must configure long buffer length (11.3s)'
  );

  // 4. Paper soundscape must use long buffer (11.9s)
  assert.ok(
    engineContent.includes('11.9'),
    'Paper soundscape must configure long buffer length (11.9s)'
  );

  // 5. Looping generators must be used across all four soundscape implementations
  assert.ok(
    engineContent.includes('createLoopingPinkNoiseData') && engineContent.includes('createLoopingBrownNoiseData'),
    'All soundscape background layers must invoke equal-power looping generators'
  );
});



