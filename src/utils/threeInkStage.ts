import type * as THREE from 'three';

export type InkThemeName = 'light' | 'dark' | 'moss' | 'rice';
export type Rgb01 = [number, number, number];

export interface MonochromeInkPalette {
  theme: InkThemeName;
  paperHex: string;
  paperSoftHex: string;
  inkStrongHex: string;
  inkMidHex: string;
  inkLightHex: string;
  accentHex: string;
  paperRgb: Rgb01;
  paperSoftRgb: Rgb01;
  inkStrongRgb: Rgb01;
  inkMidRgb: Rgb01;
  inkLightRgb: Rgb01;
  accentRgb: Rgb01;
  isDark: boolean;
}

export interface WebGLCapabilityOptions {
  win?: (Window & typeof globalThis) | null;
  doc?: Document | null;
  allowReducedMotion?: boolean;
}

export interface DisposeStats {
  geometries: number;
  materials: number;
  textures: number;
}

export interface XuanInkStageOptions {
  container: HTMLElement;
  canvas?: HTMLCanvasElement | null;
  ambient?: boolean;
  interactive?: boolean;
  intensity?: number;
  maxDpr?: number;
  loadThreeImpl?: () => Promise<typeof import('three')>;
  createRenderer?: (
    threeModule: typeof import('three'),
    canvas: HTMLCanvasElement,
  ) => Pick<THREE.WebGLRenderer, 'setSize' | 'setPixelRatio' | 'render' | 'dispose'> & {
    renderLists?: { dispose?: () => void };
  };
  win?: (Window & typeof globalThis) | null;
  doc?: Document | null;
}

export interface XuanInkStageHandle {
  readonly active: boolean;
  readonly fallback: boolean;
  isRunning: () => boolean;
  dropInkRipple: (uvX: number, uvY: number, strength?: number) => void;
  syncTheme: () => MonochromeInkPalette;
  dispose: () => DisposeStats;
}

export const MAX_INK_RIPPLES = 6;
const RIPPLE_LIFETIME_SEC = 3.4;

let cachedThreePromise: Promise<typeof import('three')> | null = null;

/**
 * Lazily imports `three` on demand so initial page loads never pay WebGL bundle cost.
 */
export function loadThree(
  customImporter?: () => Promise<typeof import('three')>,
): Promise<typeof import('three')> {
  if (customImporter) {
    return customImporter();
  }
  if (!cachedThreePromise) {
    cachedThreePromise = import('three').catch((err) => {
      cachedThreePromise = null;
      throw err;
    });
  }
  return cachedThreePromise;
}

export function resetThreeLoaderCache(): void {
  cachedThreePromise = null;
}

export function prefersReducedMotion(
  win?: Pick<Window, 'matchMedia'> | null,
): boolean {
  const targetWin = win ?? (typeof window !== 'undefined' ? window : null);
  if (!targetWin || typeof targetWin.matchMedia !== 'function') return false;
  try {
    return Boolean(targetWin.matchMedia('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

/**
 * Checks WebGL availability with zero JSDOM stderr spam and automatic reduced-motion guard.
 */
export function canUseWebGL(options: WebGLCapabilityOptions = {}): boolean {
  const win = options.win ?? (typeof window !== 'undefined' ? (window as Window & typeof globalThis) : null);
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : null);
  if (!win || !doc || typeof doc.createElement !== 'function') return false;

  if (!options.allowReducedMotion && prefersReducedMotion(win)) {
    return false;
  }

  const hasWebGLCtor =
    typeof (win as Record<string, unknown>).WebGLRenderingContext !== 'undefined' ||
    typeof (win as Record<string, unknown>).WebGL2RenderingContext !== 'undefined';
  if (!hasWebGLCtor) {
    return false;
  }

  try {
    const probeCanvas = doc.createElement('canvas');
    if (!probeCanvas || typeof probeCanvas.getContext !== 'function') return false;
    const contextAttrs: WebGLContextAttributes = {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      failIfMajorPerformanceCaveat: false,
    };
    const gl =
      (probeCanvas.getContext('webgl2', contextAttrs) as WebGLRenderingContext | null) ||
      (probeCanvas.getContext('webgl', contextAttrs) as WebGLRenderingContext | null) ||
      (probeCanvas.getContext('experimental-webgl', contextAttrs) as WebGLRenderingContext | null);
    if (!gl) return false;
    const lost = typeof gl.isContextLost === 'function' ? gl.isContextLost() : false;
    return !lost;
  } catch {
    return false;
  }
}

export function hexToRgb01(hex: string): Rgb01 {
  const cleaned = hex.trim().replace(/^#/, '');
  if (cleaned.length === 3) {
    const r = Number.parseInt(cleaned[0] + cleaned[0], 16);
    const g = Number.parseInt(cleaned[1] + cleaned[1], 16);
    const b = Number.parseInt(cleaned[2] + cleaned[2], 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return [r / 255, g / 255, b / 255];
    }
  }
  if (cleaned.length >= 6) {
    const r = Number.parseInt(cleaned.slice(0, 2), 16);
    const g = Number.parseInt(cleaned.slice(2, 4), 16);
    const b = Number.parseInt(cleaned.slice(4, 6), 16);
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return [r / 255, g / 255, b / 255];
    }
  }
  return [0, 0, 0];
}

export function parseCssColorToRgb01(raw: string | null | undefined, fallback: Rgb01): Rgb01 {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('#')) {
    return hexToRgb01(trimmed);
  }
  const rgbMatch = trimmed.match(/rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i);
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, Number.parseFloat(rgbMatch[1])));
    const g = Math.max(0, Math.min(255, Number.parseFloat(rgbMatch[2])));
    const b = Math.max(0, Math.min(255, Number.parseFloat(rgbMatch[3])));
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return [r / 255, g / 255, b / 255];
    }
  }
  return fallback;
}

const THEME_PRESETS: Record<InkThemeName, Omit<MonochromeInkPalette, 'paperRgb' | 'paperSoftRgb' | 'inkStrongRgb' | 'inkMidRgb' | 'inkLightRgb' | 'accentRgb'>> = {
  light: {
    theme: 'light',
    paperHex: '#FCFAF8',
    paperSoftHex: '#F4F4F4',
    inkStrongHex: '#111111',
    inkMidHex: '#555555',
    inkLightHex: '#7A7A7A',
    accentHex: '#222222',
    isDark: false,
  },
  dark: {
    theme: 'dark',
    paperHex: '#141414',
    paperSoftHex: '#1E1E1E',
    inkStrongHex: '#EAE8E3',
    inkMidHex: '#A8A8A8',
    inkLightHex: '#7E7E7E',
    accentHex: '#FFFFFF',
    isDark: true,
  },
  moss: {
    theme: 'moss',
    paperHex: '#00695C',
    paperSoftHex: '#00594E',
    inkStrongHex: '#FFF1F4',
    inkMidHex: '#F0C4CF',
    inkLightHex: '#CBE4E0',
    accentHex: '#FFC2D1',
    isDark: true,
  },
  rice: {
    theme: 'rice',
    paperHex: '#F2E9D8',
    paperSoftHex: '#EBE0CB',
    inkStrongHex: '#2B241C',
    inkMidHex: '#6B5F50',
    inkLightHex: '#8A7B68',
    accentHex: '#4E4132',
    isDark: false,
  },
};

export function getCanonicalInkPalette(
  rawTheme?: string | null,
  mossShade?: string | null,
): MonochromeInkPalette {
  const normalized: InkThemeName =
    rawTheme === 'dark' || rawTheme === 'moss' || rawTheme === 'rice' ? rawTheme : 'light';

  let base = THEME_PRESETS[normalized];
  if (normalized === 'moss' && mossShade) {
    const upper = mossShade.trim().replace(/^#/, '').toUpperCase();
    if (upper === '4DB6AC') {
      base = {
        theme: 'moss',
        paperHex: '#4DB6AC',
        paperSoftHex: '#3FA59B',
        inkStrongHex: '#00221D',
        inkMidHex: '#004D40',
        inkLightHex: '#00695C',
        accentHex: '#00362E',
        isDark: false,
      };
    } else if (/^[0-9A-F]{6}$/.test(upper)) {
      base = {
        ...base,
        paperHex: `#${upper}`,
      };
    }
  }

  return {
    ...base,
    paperRgb: hexToRgb01(base.paperHex),
    paperSoftRgb: hexToRgb01(base.paperSoftHex),
    inkStrongRgb: hexToRgb01(base.inkStrongHex),
    inkMidRgb: hexToRgb01(base.inkMidHex),
    inkLightRgb: hexToRgb01(base.inkLightHex),
    accentRgb: hexToRgb01(base.accentHex),
  };
}

export function resolveInkPalette(
  doc?: Document | null,
  win?: Pick<Window, 'getComputedStyle'> | null,
): MonochromeInkPalette {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  const targetWin = win ?? (typeof window !== 'undefined' ? window : null);
  const root = targetDoc?.documentElement ?? null;

  const themeAttr = root?.getAttribute('data-theme') ?? 'light';
  const mossShadeAttr = root?.getAttribute('data-moss-shade') ?? null;
  const canonical = getCanonicalInkPalette(themeAttr, mossShadeAttr);

  if (!root || !targetWin || typeof targetWin.getComputedStyle !== 'function') {
    return canonical;
  }

  try {
    const style = targetWin.getComputedStyle(root);
    const paperRgb = parseCssColorToRgb01(style.getPropertyValue('--bg-base'), canonical.paperRgb);
    const paperSoftRgb = parseCssColorToRgb01(style.getPropertyValue('--bg-soft'), canonical.paperSoftRgb);
    const inkStrongRgb = parseCssColorToRgb01(style.getPropertyValue('--ink-strong'), canonical.inkStrongRgb);
    const inkMidRgb = parseCssColorToRgb01(style.getPropertyValue('--ink-mid'), canonical.inkMidRgb);
    const inkLightRgb = parseCssColorToRgb01(style.getPropertyValue('--ink-light'), canonical.inkLightRgb);
    const accentRgb = parseCssColorToRgb01(style.getPropertyValue('--accent'), canonical.accentRgb);

    return {
      ...canonical,
      paperRgb,
      paperSoftRgb,
      inkStrongRgb,
      inkMidRgb,
      inkLightRgb,
      accentRgb,
    };
  } catch {
    return canonical;
  }
}

export function observeThemePalette(
  onChange: (palette: MonochromeInkPalette) => void,
  doc?: Document | null,
  win?: Pick<Window, 'getComputedStyle'> | null,
): () => void {
  const targetDoc = doc ?? (typeof document !== 'undefined' ? document : null);
  const root = targetDoc?.documentElement ?? null;
  const view = (win ?? targetDoc?.defaultView ?? (typeof window !== 'undefined' ? window : null)) as
    | (Pick<Window, 'getComputedStyle'> & { MutationObserver?: typeof MutationObserver })
    | null;
  const MutationObs =
    view?.MutationObserver ?? (typeof MutationObserver !== 'undefined' ? MutationObserver : undefined);
  if (!root || !MutationObs) {
    return () => {};
  }

  const observer = new MutationObs(() => {
    onChange(resolveInkPalette(targetDoc, win ?? targetDoc?.defaultView ?? null));
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-moss-shade', 'class'],
  });
  return () => observer.disconnect();
}

function isDisposableTexture(val: unknown): val is { dispose: () => void } {
  if (!val || typeof val !== 'object') return false;
  const candidate = val as Record<string, unknown>;
  if (typeof candidate.dispose !== 'function') return false;
  return Boolean(candidate.isTexture || 'mipmaps' in candidate || 'image' in candidate);
}

/**
 * Recursively disposes geometries, materials, material textures, and shader uniform textures.
 */
export function disposeThreeHierarchy(root: unknown): DisposeStats {
  const geometries = new Set<{ dispose: () => void }>();
  const materials = new Set<Record<string, unknown> & { dispose: () => void }>();
  const textures = new Set<{ dispose: () => void }>();

  const inspectMaterial = (mat: unknown) => {
    if (!mat || typeof mat !== 'object') return;
    const m = mat as Record<string, unknown>;
    if (typeof m.dispose === 'function') {
      materials.add(m as Record<string, unknown> & { dispose: () => void });
    }
    for (const value of Object.values(m)) {
      if (isDisposableTexture(value)) {
        textures.add(value);
      }
    }
    if (m.uniforms && typeof m.uniforms === 'object') {
      for (const uniform of Object.values(m.uniforms as Record<string, { value?: unknown }>)) {
        const uVal = uniform?.value;
        if (isDisposableTexture(uVal)) {
          textures.add(uVal);
        } else if (Array.isArray(uVal)) {
          for (const item of uVal) {
            if (isDisposableTexture(item)) textures.add(item);
          }
        }
      }
    }
  };

  const visitNode = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const geom = obj.geometry as { dispose?: () => void } | undefined;
    if (geom && typeof geom.dispose === 'function') {
      geometries.add(geom as { dispose: () => void });
    }
    const mat = obj.material;
    if (Array.isArray(mat)) {
      for (const item of mat) inspectMaterial(item);
    } else if (mat) {
      inspectMaterial(mat);
    }
  };

  if (root && typeof root === 'object') {
    const r = root as { traverse?: (cb: (child: unknown) => void) => void; children?: unknown[] };
    if (typeof r.traverse === 'function') {
      r.traverse(visitNode);
    } else {
      const stack: unknown[] = [root];
      while (stack.length > 0) {
        const current = stack.pop();
        visitNode(current);
        const children = (current as { children?: unknown[] } | null)?.children;
        if (Array.isArray(children)) {
          for (const child of children) stack.push(child);
        }
      }
    }
  }

  for (const tex of textures) {
    try {
      tex.dispose();
    } catch {}
  }
  for (const mat of materials) {
    try {
      mat.dispose();
    } catch {}
  }
  for (const geom of geometries) {
    try {
      geom.dispose();
    } catch {}
  }

  return {
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
  };
}

export function disposeWebGLRenderer(renderer: unknown): void {
  if (!renderer || typeof renderer !== 'object') return;
  const r = renderer as {
    renderLists?: { dispose?: () => void };
    dispose?: () => void;
  };
  try {
    r.renderLists?.dispose?.();
  } catch {}
  try {
    r.dispose?.();
  } catch {}
}

/**
 * Custom GLSL Xuan-Paper Capillary Ink Wash & Pointer Ripple Shaders
 * - Anisotropic laid-paper fiber field (`xuanFiberField`) models hand-laid Xuan paper absorption
 * - Feathered dry-brush (`feibai`) capillary ripple fronts expand without any CSS filter:blur
 * - Pure monochrome ink tones synced dynamically across light / dark / moss / rice themes
 */
export const XUAN_INK_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const XUAN_INK_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

varying vec2 vUv;

uniform float uTime;
uniform vec2 uResolution;
uniform float uIntensity;
uniform float uAmbient;
uniform vec3 uPaperColor;
uniform vec3 uPaperSoftColor;
uniform vec3 uInkStrongColor;
uniform vec3 uInkMidColor;
uniform vec4 uRipples[6];

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Anisotropic Xuan-paper laid fiber texture (weft + warp capillary pores)
float xuanFiberField(vec2 p) {
  float weft = valueNoise(vec2(p.x * 26.0, p.y * 5.5));
  float warp = valueNoise(vec2(p.x * 6.5, p.y * 22.0));
  float fine = valueNoise(p * 44.0);
  return weft * 0.46 + warp * 0.34 + fine * 0.20;
}

float mistFbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.52;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    sum += amp * valueNoise(p);
    p = rot * p * 2.03 + vec2(7.1, 3.7);
    amp *= 0.5;
  }
  return sum;
}

void main() {
  float aspect = max(0.25, uResolution.x / max(1.0, uResolution.y));
  vec2 metricUv = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);

  float fiber = xuanFiberField(metricUv * 2.4);

  // Subtle breathing mountain-mist wash in background when ambient is enabled
  float slowDrift = uTime * 0.038;
  float mistA = mistFbm(metricUv * 2.1 + vec2(slowDrift, -slowDrift * 0.65));
  float mistB = mistFbm(metricUv * 3.4 - vec2(slowDrift * 0.5, slowDrift * 0.8) + mistA * 0.45);
  float ambientWash = smoothstep(0.44, 0.86, mistB * 0.78 + fiber * 0.22) * 0.085 * uAmbient;

  // Capillary ink ripples triggered by pointer motion / ink drops
  float rippleInk = 0.0;
  float coreInk = 0.0;

  for (int i = 0; i < 6; i++) {
    vec4 rp = uRipples[i];
    float age = uTime - rp.z;
    if (rp.w > 0.001 && age >= 0.0 && age < 3.4) {
      vec2 center = vec2((rp.x - 0.5) * aspect, rp.y - 0.5);
      vec2 delta = metricUv - center;
      float dist = length(delta);

      // Capillary diffusion radius slows down as water seeps into dry Xuan fibers
      float progress = clamp(age / 3.4, 0.0, 1.0);
      float frontRadius = 0.022 + 0.34 * (1.0 - exp(-age * 1.35));

      // Fiber-modulated irregular feibai rim
      float angleNoise = valueNoise(delta * 18.0 + float(i) * 4.3 + fiber * 1.8);
      float warpedDist = dist + (fiber - 0.5) * 0.022 + (angleNoise - 0.5) * 0.016;

      float outerRing = exp(-pow((warpedDist - frontRadius) / (0.018 + progress * 0.022), 2.0));
      float echoRadius = frontRadius * 0.64;
      float innerEcho = exp(-pow((warpedDist - echoRadius) / 0.014, 2.0)) * 0.45;
      float wetBlot = smoothstep(frontRadius * 0.82, 0.0, warpedDist) * exp(-age * 2.1) * 0.42;

      float fade = (1.0 - smoothstep(0.35, 1.0, progress)) * rp.w;
      rippleInk += (outerRing * 0.72 + innerEcho) * fade;
      coreInk += wetBlot * rp.w;
    }
  }

  float totalWash = clamp((ambientWash + rippleInk * 0.34 + coreInk * 0.48) * uIntensity, 0.0, 0.68);
  float fiberGrain = (fiber - 0.5) * 0.028 * uIntensity;

  vec3 basePaper = mix(uPaperColor, uPaperSoftColor, clamp(mistA * 0.45 + fiberGrain, 0.0, 1.0));
  vec3 inkTone = mix(uInkMidColor, uInkStrongColor, clamp(coreInk * 1.4 + rippleInk * 0.45, 0.0, 1.0));
  vec3 finalRgb = mix(basePaper, inkTone, totalWash);
  float alpha = clamp(totalWash * 1.45 + abs(fiberGrain) * 0.35, 0.0, 0.82);

  gl_FragColor = vec4(finalRgb, alpha);
}
`;

export async function createXuanInkStage(
  options: XuanInkStageOptions,
): Promise<XuanInkStageHandle> {
  const win = options.win ?? (typeof window !== 'undefined' ? (window as Window & typeof globalThis) : null);
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : null);
  const { container } = options;
  const ambient = options.ambient !== false;
  const interactive = options.interactive !== false;
  const intensity = Math.max(0.05, Math.min(1.5, options.intensity ?? 0.65));
  const maxDpr = Math.max(1, Math.min(2, options.maxDpr ?? 1.75));

  const applyFallbackVars = () => {
    const pal = resolveInkPalette(doc, win);
    container.style.setProperty('--three-ink-paper', pal.paperHex);
    container.style.setProperty('--three-ink-soft', pal.paperSoftHex);
    container.style.setProperty('--three-ink-strong', pal.inkStrongHex);
    container.style.setProperty('--three-ink-mid', pal.inkMidHex);
    return pal;
  };

  const webglReady = Boolean(options.createRenderer) || canUseWebGL({ win, doc });
  if (!webglReady || !win || !doc || prefersReducedMotion(win)) {
    container.dataset.inkMode = 'fallback';
    container.dataset.fallback = 'true';
    applyFallbackVars();
    const stopTheme = observeThemePalette(() => {
      applyFallbackVars();
    }, doc, win);
    let fallbackDisposed = false;
    return {
      active: false,
      fallback: true,
      isRunning: () => false,
      dropInkRipple: () => {},
      syncTheme: () => applyFallbackVars(),
      dispose: () => {
        if (!fallbackDisposed) {
          fallbackDisposed = true;
          stopTheme();
        }
        return { geometries: 0, materials: 0, textures: 0 };
      },
    };
  }

  let disposed = false;
  const AbortCtrl = win.AbortController ?? AbortController;
  const controller = new AbortCtrl();
  const { signal } = controller;

  let THREE_MOD: typeof import('three');
  try {
    THREE_MOD = await loadThree(options.loadThreeImpl);
  } catch {
    container.dataset.inkMode = 'fallback';
    container.dataset.fallback = 'true';
    applyFallbackVars();
    return {
      active: false,
      fallback: true,
      isRunning: () => false,
      dropInkRipple: () => {},
      syncTheme: () => applyFallbackVars(),
      dispose: () => ({ geometries: 0, materials: 0, textures: 0 }),
    };
  }

  if (disposed || !container.isConnected) {
    return {
      active: false,
      fallback: true,
      isRunning: () => false,
      dropInkRipple: () => {},
      syncTheme: () => applyFallbackVars(),
      dispose: () => ({ geometries: 0, materials: 0, textures: 0 }),
    };
  }

  let ownedCanvas = false;
  let canvas = options.canvas ?? container.querySelector<HTMLCanvasElement>('[data-three-ink-webgl]');
  if (!canvas) {
    canvas = doc.createElement('canvas');
    canvas.className = 'three-ink-webgl';
    canvas.dataset.threeInkWebgl = 'true';
    canvas.setAttribute('aria-hidden', 'true');
    container.prepend(canvas);
    ownedCanvas = true;
  }

  let renderer: Pick<THREE.WebGLRenderer, 'setSize' | 'setPixelRatio' | 'render' | 'dispose'> & {
    renderLists?: { dispose?: () => void };
  };
  try {
    renderer = options.createRenderer
      ? options.createRenderer(THREE_MOD, canvas)
      : new THREE_MOD.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          powerPreference: 'low-power',
        });
  } catch {
    container.dataset.inkMode = 'fallback';
    container.dataset.fallback = 'true';
    applyFallbackVars();
    return {
      active: false,
      fallback: true,
      isRunning: () => false,
      dropInkRipple: () => {},
      syncTheme: () => applyFallbackVars(),
      dispose: () => ({ geometries: 0, materials: 0, textures: 0 }),
    };
  }

  container.dataset.inkMode = 'webgl';
  delete container.dataset.fallback;

  const initialPalette = applyFallbackVars();
  const rippleVecs = Array.from(
    { length: MAX_INK_RIPPLES },
    () => new THREE_MOD.Vector4(-10, -10, -100, 0),
  );

  let cachedLeft = 0;
  let cachedTop = 0;
  let cachedWidth = Math.max(1, container.clientWidth || 320);
  let cachedHeight = Math.max(1, container.clientHeight || 240);

  const uniforms = {
    uTime: { value: 0 },
    uResolution: { value: new THREE_MOD.Vector2(cachedWidth, cachedHeight) },
    uIntensity: { value: intensity },
    uAmbient: { value: ambient ? 1.0 : 0.0 },
    uPaperColor: { value: new THREE_MOD.Vector3(...initialPalette.paperRgb) },
    uPaperSoftColor: { value: new THREE_MOD.Vector3(...initialPalette.paperSoftRgb) },
    uInkStrongColor: { value: new THREE_MOD.Vector3(...initialPalette.inkStrongRgb) },
    uInkMidColor: { value: new THREE_MOD.Vector3(...initialPalette.inkMidRgb) },
    uRipples: { value: rippleVecs },
  };

  const scene = new THREE_MOD.Scene();
  const camera = new THREE_MOD.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new THREE_MOD.PlaneGeometry(2, 2);
  const material = new THREE_MOD.ShaderMaterial({
    vertexShader: XUAN_INK_VERTEX_SHADER,
    fragmentShader: XUAN_INK_FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const quad = new THREE_MOD.Mesh(geometry, material);
  scene.add(quad);

  let rafId = 0;
  let startClockMs = 0;
  let elapsedSec = 0;
  let lastFrameMs = 0;
  let inViewport = true;
  let modalOpen = false;
  let rippleCursor = 0;
  let newestRippleBirthSec = -100;
  let lastPointerDropMs = 0;
  let lastUvX = -10;
  let lastUvY = -10;

  const syncRendererSize = (w: number, h: number) => {
    cachedWidth = Math.max(1, Math.round(w));
    cachedHeight = Math.max(1, Math.round(h));
    const dpr = Math.min(win.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(cachedWidth, cachedHeight, false);
    uniforms.uResolution.value.set(cachedWidth * dpr, cachedHeight * dpr);
  };

  const refreshCachedOffset = () => {
    if (disposed) return;
    const rect = container.getBoundingClientRect();
    cachedLeft = rect.left;
    cachedTop = rect.top;
    if (rect.width > 0 && rect.height > 0) {
      if (Math.abs(rect.width - cachedWidth) > 0.5 || Math.abs(rect.height - cachedHeight) > 0.5) {
        syncRendererSize(rect.width, rect.height);
      }
    }
  };

  syncRendererSize(cachedWidth, cachedHeight);
  refreshCachedOffset();

  const hasLiveRipples = () => elapsedSec - newestRippleBirthSec < RIPPLE_LIFETIME_SEC;

  const shouldAnimate = () => {
    if (disposed || signal.aborted) return false;
    if (doc.hidden || !inViewport || modalOpen) return false;
    return ambient || hasLiveRipples();
  };

  const stopLoop = () => {
    if (rafId) {
      win.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastFrameMs = 0;
  };

  const tick = (nowMs: number) => {
    rafId = 0;
    if (!shouldAnimate()) {
      lastFrameMs = 0;
      return;
    }
    if (!startClockMs) startClockMs = nowMs;
    if (!lastFrameMs) lastFrameMs = nowMs;
    const dtSec = Math.min(0.1, Math.max(0, (nowMs - lastFrameMs) / 1000));
    lastFrameMs = nowMs;
    elapsedSec += dtSec;

    uniforms.uTime.value = elapsedSec;
    renderer.render(scene, camera);

    if (shouldAnimate()) {
      rafId = win.requestAnimationFrame(tick);
    }
  };

  const ensureLoop = () => {
    if (!rafId && shouldAnimate()) {
      lastFrameMs = 0;
      rafId = win.requestAnimationFrame(tick);
    }
  };

  const dropInkRipple = (uvX: number, uvY: number, strength = 0.85) => {
    if (disposed) return;
    const clampedX = Math.max(0, Math.min(1, uvX));
    const clampedY = Math.max(0, Math.min(1, uvY));
    const clampedStrength = Math.max(0.05, Math.min(1.5, strength));
    rippleVecs[rippleCursor].set(clampedX, clampedY, elapsedSec, clampedStrength);
    rippleCursor = (rippleCursor + 1) % MAX_INK_RIPPLES;
    newestRippleBirthSec = elapsedSec;
    ensureLoop();
  };

  const syncTheme = (): MonochromeInkPalette => {
    const pal = applyFallbackVars();
    uniforms.uPaperColor.value.set(...pal.paperRgb);
    uniforms.uPaperSoftColor.value.set(...pal.paperSoftRgb);
    uniforms.uInkStrongColor.value.set(...pal.inkStrongRgb);
    uniforms.uInkMidColor.value.set(...pal.inkMidRgb);
    if (!disposed && !doc.hidden && inViewport && !modalOpen) {
      renderer.render(scene, camera);
    }
    return pal;
  };

  const stopThemeObserver = observeThemePalette(() => {
    syncTheme();
  }, doc, win);

  let resizeObserver: ResizeObserver | null = null;
  const ResizeObs = win.ResizeObserver ?? (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
  if (ResizeObs) {
    resizeObserver = new ResizeObs((entries) => {
      if (disposed) return;
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0 && cr.height > 0) {
          syncRendererSize(cr.width, cr.height);
        }
      }
      const rect = container.getBoundingClientRect();
      cachedLeft = rect.left;
      cachedTop = rect.top;
      if (!rafId && !doc.hidden && inViewport && !modalOpen) {
        renderer.render(scene, camera);
      }
    });
    resizeObserver.observe(container);
  }

  let io: IntersectionObserver | null = null;
  const IntersectionObs =
    win.IntersectionObserver ?? (typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : undefined);
  if (IntersectionObs) {
    io = new IntersectionObs(
      (entries) => {
        for (const entry of entries) {
          inViewport = entry.isIntersecting;
        }
        if (!inViewport) {
          stopLoop();
        } else {
          ensureLoop();
        }
      },
      { rootMargin: '80px 0px' },
    );
    io.observe(container);
  }

  doc.addEventListener(
    'visibilitychange',
    () => {
      if (doc.hidden) {
        stopLoop();
      } else {
        ensureLoop();
      }
    },
    { signal },
  );

  const onModalEnter = () => {
    modalOpen = true;
    stopLoop();
  };
  const onModalLeave = () => {
    modalOpen = false;
    ensureLoop();
  };
  win.addEventListener('app:modal-enter', onModalEnter, { signal });
  win.addEventListener('app:modal-leave', onModalLeave, { signal });
  doc.addEventListener('app:modal-enter', onModalEnter, { signal });
  doc.addEventListener('app:modal-leave', onModalLeave, { signal });

  win.addEventListener('scroll', refreshCachedOffset, { passive: true, signal });
  win.addEventListener('resize', refreshCachedOffset, { passive: true, signal });

  if (interactive) {
    container.addEventListener('pointerenter', refreshCachedOffset, { passive: true, signal });

    // Zero sync layout reads inside pointermove: uses cachedLeft / cachedTop / cachedWidth / cachedHeight
    container.addEventListener(
      'pointermove',
      (e: PointerEvent) => {
        if (disposed || modalOpen) return;
        const now = performance.now();
        if (now - lastPointerDropMs < 56) return;
        const uvX = (e.clientX - cachedLeft) / Math.max(1, cachedWidth);
        const uvY = 1.0 - (e.clientY - cachedTop) / Math.max(1, cachedHeight);
        if (uvX < 0 || uvX > 1 || uvY < 0 || uvY > 1) return;
        if (Math.hypot(uvX - lastUvX, uvY - lastUvY) < 0.032) return;
        lastUvX = uvX;
        lastUvY = uvY;
        lastPointerDropMs = now;
        dropInkRipple(uvX, uvY, 0.58);
      },
      { passive: true, signal },
    );

    container.addEventListener(
      'pointerdown',
      (e: PointerEvent) => {
        if (disposed || modalOpen) return;
        refreshCachedOffset();
        const uvX = (e.clientX - cachedLeft) / Math.max(1, cachedWidth);
        const uvY = 1.0 - (e.clientY - cachedTop) / Math.max(1, cachedHeight);
        if (uvX < 0 || uvX > 1 || uvY < 0 || uvY > 1) return;
        dropInkRipple(uvX, uvY, 1.0);
      },
      { passive: true, signal },
    );
  }

  let lastDisposeStats: DisposeStats = { geometries: 0, materials: 0, textures: 0 };

  const dispose = (): DisposeStats => {
    if (disposed) return lastDisposeStats;
    disposed = true;
    stopLoop();
    controller.abort();
    stopThemeObserver();
    resizeObserver?.disconnect();
    resizeObserver = null;
    io?.disconnect();
    io = null;
    lastDisposeStats = disposeThreeHierarchy(scene);
    scene.clear();
    disposeWebGLRenderer(renderer);
    if (ownedCanvas && canvas?.parentElement === container) {
      canvas.remove();
    }
    return lastDisposeStats;
  };

  doc.addEventListener(
    'astro:before-swap',
    () => {
      dispose();
    },
    { once: true, signal },
  );

  // Render initial Xuan-paper frame immediately and start loop if ambient
  renderer.render(scene, camera);
  ensureLoop();

  return {
    active: true,
    fallback: false,
    isRunning: () => rafId !== 0,
    dropInkRipple,
    syncTheme,
    dispose,
  };
}
