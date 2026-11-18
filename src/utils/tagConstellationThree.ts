import type * as THREE from 'three';
import {
  canUseWebGL,
  disposeThreeHierarchy,
  disposeWebGLRenderer,
  loadThree,
  observeThemePalette,
  prefersReducedMotion,
  resolveInkPalette,
} from './threeInkStage.ts';
import type { DisposeStats } from './threeInkStage.ts';

export interface TagDomNodeInput {
  el: HTMLElement;
  name: string;
  hw: number;
  hh: number;
  weight: number;
}

export interface NebulaNode3D {
  name: string;
  weight: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  targetRadius: number;
}

export interface NebulaLinkIndex {
  aIndex: number;
  bIndex: number;
  weight: number;
  bowSign: 1 | -1;
}

export interface TagConstellationThreeOptions {
  sky: HTMLElement;
  canvas?: HTMLCanvasElement | null;
  nodes: TagDomNodeInput[];
  pairs: Array<[string, string, number]>;
  onZoomChange?: (zoom: number) => void;
  onFallback?: () => void;
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

export interface TagConstellationThreeHandle {
  readonly active: boolean;
  readonly fallback: boolean;
  isRunning: () => boolean;
  highlight: (tagName: string | null) => void;
  resetView: () => void;
  getZoom: () => number;
  dispose: () => DisposeStats;
}

const SEGMENTS_PER_FILAMENT = 14;
const STEP_SEC = 1 / 60;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Seeds nodes onto a Golden-Spiral Fibonacci sphere with core-weighted radial hierarchy.
 */
export function seedSphericalNebula(
  items: ReadonlyArray<{ name: string; weight: number }>,
  sphereRadius: number,
): NebulaNode3D[] {
  const total = Math.max(1, items.length);
  return items.map((item, idx) => {
    const w = Math.max(0, Math.min(1, item.weight));
    const yNorm = total === 1 ? 0 : 1 - ((idx + 0.5) / total) * 2;
    const radialXY = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
    const theta = GOLDEN_ANGLE * idx + 0.42;
    const shellScale = 0.66 + (1 - w) * 0.36;
    const r = sphereRadius * shellScale;

    return {
      name: item.name,
      weight: w,
      x: Math.cos(theta) * radialXY * r,
      y: yNorm * r * 0.88,
      z: Math.sin(theta) * radialXY * r,
      vx: 0,
      vy: 0,
      vz: 0,
      targetRadius: r,
    };
  });
}

/**
 * Advances 3D spherical force-directed nebula by one fixed 60Hz step.
 */
export function stepSphericalNebula(
  nodes: NebulaNode3D[],
  links: ReadonlyArray<NebulaLinkIndex>,
  sphereRadius: number,
  alpha: number,
  maxPairWeight: number,
): number {
  const n = nodes.length;
  const chargeScale = sphereRadius * sphereRadius * 0.085;

  for (let i = 0; i < n; i += 1) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j += 1) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dz = b.z - a.z;
      let dist2 = dx * dx + dy * dy + dz * dz;
      if (dist2 < 4) {
        dx = ((i * 17 + j * 31) % 11) - 5;
        dy = ((i * 23 + j * 13) % 11) - 5;
        dz = ((i * 29 + j * 7) % 11) - 5;
        dist2 = Math.max(9, dx * dx + dy * dy + dz * dz);
      }
      const dist = Math.sqrt(dist2);
      const repulse = chargeScale / Math.max(dist2, 196);
      const fx = (dx / dist) * repulse;
      const fy = (dy / dist) * repulse;
      constfz: {
        const fz = (dz / dist) * repulse;
        a.vx -= fx;
        a.vy -= fy;
        a.vz -= fz;
        b.vx += fx;
        b.vy += fy;
        b.vz += fz;
        break constfz;
      }
    }
  }

  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    const a = nodes[link.aIndex];
    const b = nodes[link.bIndex];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const dist = Math.max(1, Math.hypot(dx, dy, dz));
    const rest = sphereRadius * (0.42 + 0.44 / Math.max(1, link.weight));
    const stiffness = 0.016 * Math.min(1.65, 0.55 + link.weight / Math.max(1, maxPairWeight));
    const pull = (dist - rest) * stiffness;
    const px = (dx / dist) * pull;
    const py = (dy / dist) * pull;
    const pz = (dz / dist) * pull;
    a.vx += px;
    a.vy += py;
    a.vz += pz;
    b.vx -= px;
    b.vy -= py;
    b.vz -= pz;
  }

  let maxMove = 0;
  const maxBound = sphereRadius * 1.32;
  for (let i = 0; i < n; i += 1) {
    const node = nodes[i];
    const radial = Math.max(1, Math.hypot(node.x, node.y, node.z));
    const shellPull = (node.targetRadius - radial) * 0.024;
    node.vx += (node.x / radial) * shellPull;
    node.vy += (node.y / radial) * shellPull - node.y * 0.0025;
    node.vz += (node.z / radial) * shellPull;

    node.vx *= 0.85;
    node.vy *= 0.85;
    node.vz *= 0.85;

    const prevX = node.x;
    const prevY = node.y;
    const prevZ = node.z;

    node.x = Math.max(-maxBound, Math.min(maxBound, node.x + node.vx * alpha));
    node.y = Math.max(-maxBound, Math.min(maxBound, node.y + node.vy * alpha));
    node.z = Math.max(-maxBound, Math.min(maxBound, node.z + node.vz * alpha));

    const disp = Math.abs(node.x - prevX) + Math.abs(node.y - prevY) + Math.abs(node.z - prevZ);
    if (disp > maxMove) maxMove = disp;
  }

  return maxMove;
}

export const FILAMENT_VERTEX_SHADER = /* glsl */ `
attribute float aArcU;
attribute float aBaseOpacity;
attribute float aLitState;
attribute float aFlowDir;

varying float vArcU;
varying float vBaseOpacity;
varying float vLitState;
varying float vFlowDir;

void main() {
  vArcU = aArcU;
  vBaseOpacity = aBaseOpacity;
  vLitState = aLitState;
  vFlowDir = aFlowDir;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const FILAMENT_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform float uTime;
uniform vec3 uInkColor;
uniform vec3 uAccentColor;

varying float vArcU;
varying float vBaseOpacity;
varying float vLitState;
varying float vFlowDir;

void main() {
  // Subtle dry-brush taper at both ends of the filament
  float endTaper = sin(clamp(vArcU, 0.0, 1.0) * 3.14159265);
  float strokeProfile = mix(0.45, 1.0, endTaper);

  if (vLitState > 0.5) {
    float orientedU = vFlowDir >= 0.0 ? vArcU : (1.0 - vArcU);
    float streamPhase = fract(orientedU * 2.4 - uTime * 0.68);
    float pulse = smoothstep(0.0, 0.24, streamPhase) * (1.0 - smoothstep(0.28, 0.72, streamPhase));
    vec3 litRgb = mix(uInkColor, uAccentColor, 0.55 + pulse * 0.45);
    float litAlpha = clamp((0.32 + pulse * 0.62) * strokeProfile, 0.0, 0.95);
    gl_FragColor = vec4(litRgb, litAlpha);
    return;
  }

  float dimScale = vLitState < -0.5 ? 0.28 : 1.0;
  float alpha = clamp(vBaseOpacity * strokeProfile * dimScale, 0.0, 0.65);
  gl_FragColor = vec4(uInkColor, alpha);
}
`;

export const STAR_HALO_VERTEX_SHADER = /* glsl */ `
attribute float aWeight;
attribute float aFocusState;

uniform float uPixelRatio;
uniform float uZoom;

varying float vFocusState;
varying float vDepthFade;

void main() {
  vFocusState = aFocusState;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = max(60.0, -mvPosition.z);
  vDepthFade = clamp(520.0 / dist, 0.42, 1.25);

  float focusBoost = aFocusState > 1.5 ? 1.55 : (aFocusState > 0.5 ? 1.22 : 1.0);
  float baseSize = (10.0 + aWeight * 14.0) * focusBoost * uZoom;
  gl_PointSize = clamp(baseSize * uPixelRatio * (380.0 / dist), 6.0, 64.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const STAR_HALO_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform vec3 uInkColor;
uniform vec3 uAccentColor;

varying float vFocusState;
varying float vDepthFade;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float r = length(centered) * 2.0;
  if (r > 1.0) discard;

  // Crisp monochrome ink nucleus + concentric water-ring halo (zero blur filter)
  float nucleus = 1.0 - smoothstep(0.14, 0.30, r);
  float waterRing = smoothstep(0.50, 0.60, r) * (1.0 - smoothstep(0.64, 0.76, r));
  float softWash = (1.0 - smoothstep(0.18, 0.88, r)) * 0.26;

  float isOrigin = step(1.5, vFocusState);
  float isLit = step(0.5, vFocusState);
  float isDim = step(vFocusState, -0.5);

  float ringGain = mix(0.28, 0.92, isLit);
  float alpha = (nucleus * 0.86 + waterRing * ringGain + softWash) * mix(1.0, 0.24, isDim) * clamp(vDepthFade, 0.5, 1.0);
  vec3 rgb = mix(uInkColor, uAccentColor, max(isOrigin, isLit * 0.65));

  gl_FragColor = vec4(rgb, clamp(alpha, 0.0, 0.95));
}
`;

function writeCurvedFilamentPositions(
  nodes: ReadonlyArray<NebulaNode3D>,
  links: ReadonlyArray<NebulaLinkIndex>,
  positions: Float32Array,
): void {
  let cursor = 0;
  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    const a = nodes[link.aIndex];
    const b = nodes[link.bIndex];

    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    const mz = (a.z + b.z) * 0.5;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const chord = Math.max(1, Math.hypot(dx, dy, dz));
    const bow = Math.min(38, chord * 0.14);

    // Outward radial + subtle cross-tangent bow for calligraphic 3D curvature
    const mLen = Math.max(1, Math.hypot(mx, my, mz));
    const nx = mx / mLen;
    const ny = my / mLen;
    const nz = mz / mLen;

    const tx = (dy * nz - dz * ny) / chord;
    const ty = (dz * nx - dx * nz) / chord;
    const tz = (dx * ny - dy * nx) / chord;

    const cx = mx + nx * bow * 0.72 + tx * bow * 0.36 * link.bowSign;
    const cy = my + ny * bow * 0.72 + ty * bow * 0.36 * link.bowSign;
    const cz = mz + nz * bow * 0.72 + tz * bow * 0.36 * link.bowSign;

    let prevX = a.x;
    let prevY = a.y;
    let prevZ = a.z;

    for (let s = 1; s <= SEGMENTS_PER_FILAMENT; s += 1) {
      const t = s / SEGMENTS_PER_FILAMENT;
      const inv = 1 - t;
      const qx = inv * inv * a.x + 2 * inv * t * cx + t * t * b.x;
      const qy = inv * inv * a.y + 2 * inv * t * cy + t * t * b.y;
      const qz = inv * inv * a.z + 2 * inv * t * cz + t * t * b.z;

      positions[cursor] = prevX;
      positions[cursor + 1] = prevY;
      positions[cursor + 2] = prevZ;
      positions[cursor + 3] = qx;
      positions[cursor + 4] = qy;
      positions[cursor + 5] = qz;
      cursor += 6;

      prevX = qx;
      prevY = qy;
      prevZ = qz;
    }
  }
}

export async function createTagConstellationThree(
  options: TagConstellationThreeOptions,
): Promise<TagConstellationThreeHandle> {
  const win = options.win ?? (typeof window !== 'undefined' ? (window as Window & typeof globalThis) : null);
  const doc = options.doc ?? (typeof document !== 'undefined' ? document : null);
  const { sky, nodes: domNodes, pairs } = options;

  const webglSupported = Boolean(options.createRenderer) || canUseWebGL({ win, doc });
  if (!webglSupported || !win || !doc || prefersReducedMotion(win) || domNodes.length === 0) {
    options.onFallback?.();
    return {
      active: false,
      fallback: true,
      isRunning: () => false,
      highlight: () => {},
      resetView: () => {},
      getZoom: () => 1,
      dispose: () => ({ geometries: 0, materials: 0, textures: 0 }),
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
    options.onFallback?.();
    return {
      active: false,
      fallback: true,
      isRunning: () => false,
      highlight: () => {},
      resetView: () => {},
      getZoom: () => 1,
      dispose: () => ({ geometries: 0, materials: 0, textures: 0 }),
    };
  }

  if (disposed || !sky.isConnected) {
    return {
      active: false,
      fallback: true,
      isRunning: () => false,
      highlight: () => {},
      resetView: () => {},
      getZoom: () => 1,
      dispose: () => ({ geometries: 0, materials: 0, textures: 0 }),
    };
  }

  let ownedCanvas = false;
  let canvas = options.canvas ?? sky.querySelector<HTMLCanvasElement>('[data-tag-webgl]');
  if (!canvas) {
    canvas = doc.createElement('canvas');
    canvas.className = 'tag-sky-webgl';
    canvas.dataset.tagWebgl = 'true';
    canvas.setAttribute('aria-hidden', 'true');
    sky.prepend(canvas);
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
          antialias: true,
          powerPreference: 'high-performance',
        });
  } catch {
    options.onFallback?.();
    return {
      active: false,
      fallback: true,
      isRunning: () => false,
      highlight: () => {},
      resetView: () => {},
      getZoom: () => 1,
      dispose: () => ({ geometries: 0, materials: 0, textures: 0 }),
    };
  }

  let cachedWidth = Math.max(240, sky.clientWidth || 760);
  let cachedHeight = Math.max(240, sky.clientHeight || 520);
  let sphereRadius = Math.max(105, Math.min(cachedWidth, cachedHeight) * 0.35);

  const indexByName = new Map<string, number>();
  domNodes.forEach((n, idx) => indexByName.set(n.name, idx));

  const maxPairWeight = Math.max(1, ...pairs.map(([, , w]) => w));
  const links: NebulaLinkIndex[] = [];
  const neighbours = new Map<string, Set<string>>();

  pairs.forEach(([aName, bName, weight], idx) => {
    const aIndex = indexByName.get(aName);
    const bIndex = indexByName.get(bName);
    if (aIndex === undefined || bIndex === undefined) return;
    if (!neighbours.has(aName)) neighbours.set(aName, new Set());
    if (!neighbours.has(bName)) neighbours.set(bName, new Set());
    neighbours.get(aName)!.add(bName);
    neighbours.get(bName)!.add(aName);
    links.push({
      aIndex,
      bIndex,
      weight,
      bowSign: idx % 2 === 0 ? 1 : -1,
    });
  });

  const simNodes = seedSphericalNebula(domNodes, sphereRadius);
  // Pre-warm 48 steps so opening 3D view already presents a harmonious constellation
  let simAlpha = 1.0;
  for (let i = 0; i < 48; i += 1) {
    stepSphericalNebula(simNodes, links, sphereRadius, simAlpha, maxPairWeight);
    simAlpha *= 0.988;
  }
  let physicsSettled = false;

  const palette = resolveInkPalette(doc, win);
  const scene = new THREE_MOD.Scene();
  const camera = new THREE_MOD.PerspectiveCamera(44, cachedWidth / cachedHeight, 10, 2400);
  const nebulaGroup = new THREE_MOD.Group();
  scene.add(nebulaGroup);

  const getCameraDistance = () => sphereRadius * 2.95;
  camera.position.set(0, 0, getCameraDistance());

  // 1. Star-Halo Points (1 Draw Call)
  const nodeCount = simNodes.length;
  const starPositions = new Float32Array(nodeCount * 3);
  const starWeights = new Float32Array(nodeCount);
  const starFocusState = new Float32Array(nodeCount);

  for (let i = 0; i < nodeCount; i += 1) {
    starWeights[i] = simNodes[i].weight;
    starFocusState[i] = 0;
  }

  const starGeometry = new THREE_MOD.BufferGeometry();
  const starPosAttr = new THREE_MOD.BufferAttribute(starPositions, 3);
  const starFocusAttr = new THREE_MOD.BufferAttribute(starFocusState, 1);
  starGeometry.setAttribute('position', starPosAttr);
  starGeometry.setAttribute('aWeight', new THREE_MOD.BufferAttribute(starWeights, 1));
  starGeometry.setAttribute('aFocusState', starFocusAttr);

  const dpr = Math.min(win.devicePixelRatio || 1, 2);
  const starUniforms = {
    uPixelRatio: { value: dpr },
    uZoom: { value: 1.0 },
    uInkColor: { value: new THREE_MOD.Vector3(...palette.inkStrongRgb) },
    uAccentColor: { value: new THREE_MOD.Vector3(...palette.accentRgb) },
  };

  const starMaterial = new THREE_MOD.ShaderMaterial({
    vertexShader: STAR_HALO_VERTEX_SHADER,
    fragmentShader: STAR_HALO_FRAGMENT_SHADER,
    uniforms: starUniforms,
    transparent: true,
    depthWrite: false,
  });
  const starPoints = new THREE_MOD.Points(starGeometry, starMaterial);
  nebulaGroup.add(starPoints);

  // 2. Curved 3D Ink Filaments (1 Draw Call)
  const vertexCountPerLink = SEGMENTS_PER_FILAMENT * 2;
  const totalFilamentVertices = Math.max(2, links.length * vertexCountPerLink);
  const filamentPositions = new Float32Array(totalFilamentVertices * 3);
  const filamentArcU = new Float32Array(totalFilamentVertices);
  const filamentBaseOpacity = new Float32Array(totalFilamentVertices);
  const filamentLitState = new Float32Array(totalFilamentVertices);
  const filamentFlowDir = new Float32Array(totalFilamentVertices);

  for (let i = 0; i < links.length; i += 1) {
    const link = links[i];
    const baseOp = link.weight >= 2
      ? 0.16 + (link.weight / maxPairWeight) * 0.14
      : 0.065 + (link.weight / maxPairWeight) * 0.08;
    const baseOffset = i * vertexCountPerLink;
    for (let s = 0; s < SEGMENTS_PER_FILAMENT; s += 1) {
      const v0 = baseOffset + s * 2;
      const v1 = v0 + 1;
      filamentArcU[v0] = s / SEGMENTS_PER_FILAMENT;
      filamentArcU[v1] = (s + 1) / SEGMENTS_PER_FILAMENT;
      filamentBaseOpacity[v0] = baseOp;
      filamentBaseOpacity[v1] = baseOp;
      filamentLitState[v0] = 0;
      filamentLitState[v1] = 0;
      filamentFlowDir[v0] = 1;
      filamentFlowDir[v1] = 1;
    }
  }

  const filamentGeometry = new THREE_MOD.BufferGeometry();
  const filamentPosAttr = new THREE_MOD.BufferAttribute(filamentPositions, 3);
  const filamentLitAttr = new THREE_MOD.BufferAttribute(filamentLitState, 1);
  const filamentDirAttr = new THREE_MOD.BufferAttribute(filamentFlowDir, 1);
  filamentGeometry.setAttribute('position', filamentPosAttr);
  filamentGeometry.setAttribute('aArcU', new THREE_MOD.BufferAttribute(filamentArcU, 1));
  filamentGeometry.setAttribute('aBaseOpacity', new THREE_MOD.BufferAttribute(filamentBaseOpacity, 1));
  filamentGeometry.setAttribute('aLitState', filamentLitAttr);
  filamentGeometry.setAttribute('aFlowDir', filamentDirAttr);
  filamentGeometry.setDrawRange(0, links.length * vertexCountPerLink);

  const filamentUniforms = {
    uTime: { value: 0 },
    uInkColor: { value: new THREE_MOD.Vector3(...palette.inkStrongRgb) },
    uAccentColor: { value: new THREE_MOD.Vector3(...palette.accentRgb) },
  };

  const filamentMaterial = new THREE_MOD.ShaderMaterial({
    vertexShader: FILAMENT_VERTEX_SHADER,
    fragmentShader: FILAMENT_FRAGMENT_SHADER,
    uniforms: filamentUniforms,
    transparent: true,
    depthWrite: false,
  });
  const filamentLines = new THREE_MOD.LineSegments(filamentGeometry, filamentMaterial);
  nebulaGroup.add(filamentLines);

  // 3. Ambient Deep-Space Ink Dust Motes for 3D Parallax (1 Draw Call)
  const dustCount = 42;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i += 1) {
    const yN = 1 - ((i + 0.5) / dustCount) * 2;
    const rXY = Math.sqrt(Math.max(0, 1 - yN * yN));
    const th = GOLDEN_ANGLE * (i * 3 + 7);
    const shell = sphereRadius * (1.12 + (i % 5) * 0.09);
    dustPositions[i * 3] = Math.cos(th) * rXY * shell;
    dustPositions[i * 3 + 1] = yN * shell * 0.9;
    dustPositions[i * 3 + 2] = Math.sin(th) * rXY * shell;
  }
  const dustGeometry = new THREE_MOD.BufferGeometry();
  dustGeometry.setAttribute('position', new THREE_MOD.BufferAttribute(dustPositions, 3));
  const dustMaterial = new THREE_MOD.PointsMaterial({
    color: new THREE_MOD.Color(...palette.inkMidRgb),
    size: 2.2,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const dustPoints = new THREE_MOD.Points(dustGeometry, dustMaterial);
  nebulaGroup.add(dustPoints);

  const syncGeometryBuffers = () => {
    for (let i = 0; i < nodeCount; i += 1) {
      const s = simNodes[i];
      starPositions[i * 3] = s.x;
      starPositions[i * 3 + 1] = s.y;
      starPositions[i * 3 + 2] = s.z;
    }
    starPosAttr.needsUpdate = true;
    if (links.length > 0) {
      writeCurvedFilamentPositions(simNodes, links, filamentPositions);
      filamentPosAttr.needsUpdate = true;
    }
  };
  syncGeometryBuffers();

  // Camera & Orbit State
  let yaw = -0.22;
  let pitch = 0.16;
  let targetYaw = -0.22;
  let targetPitch = 0.16;
  let inertiaYaw = 0;
  let inertiaPitch = 0;
  let zoom = 1.0;
  let targetZoom = 1.0;
  let focusedTag: string | null = null;

  const paintedState = domNodes.map(() => ({
    tx: Number.NaN,
    ty: Number.NaN,
    scale: Number.NaN,
    opacity: Number.NaN,
    zTier: -1,
  }));

  const projVec = new THREE_MOD.Vector3();

  const updateViewportSize = (w: number, h: number) => {
    cachedWidth = Math.max(240, Math.round(w));
    cachedHeight = Math.max(240, Math.round(h));
    const nextDpr = Math.min(win.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(nextDpr);
    renderer.setSize(cachedWidth, cachedHeight, false);
    starUniforms.uPixelRatio.value = nextDpr;
    camera.aspect = cachedWidth / cachedHeight;
    camera.updateProjectionMatrix();
  };
  updateViewportSize(cachedWidth, cachedHeight);

  const projectDomLabels = () => {
    nebulaGroup.rotation.set(pitch, yaw, 0);
    nebulaGroup.updateMatrixWorld(true);
    camera.position.set(0, 0, getCameraDistance() / Math.max(0.4, zoom));
    camera.updateMatrixWorld(true);

    const maxDepth = sphereRadius * 1.25;
    for (let i = 0; i < nodeCount; i += 1) {
      const sim = simNodes[i];
      const dom = domNodes[i];
      const prev = paintedState[i];

      projVec.set(sim.x, sim.y, sim.z).applyMatrix4(nebulaGroup.matrixWorld);
      const worldZ = projVec.z;
      const depthFactor = Math.max(0, Math.min(1, (worldZ + maxDepth) / (maxDepth * 2)));

      projVec.project(camera);
      const sx = (projVec.x * 0.5 + 0.5) * cachedWidth;
      const sy = (-projVec.y * 0.5 + 0.5) * cachedHeight;

      const clampedSx = Math.min(cachedWidth - dom.hw - 4, Math.max(dom.hw + 4, sx));
      const clampedSy = Math.min(cachedHeight - dom.hh - 4, Math.max(dom.hh + 4, sy));
      const tx = clampedSx - dom.hw;
      const ty = clampedSy - dom.hh;
      const scale = (0.74 + depthFactor * 0.38) * Math.min(1.18, Math.max(0.84, Math.sqrt(zoom)));

      if (
        Number.isNaN(prev.tx) ||
        Math.abs(tx - prev.tx) > 0.04 ||
        Math.abs(ty - prev.ty) > 0.04 ||
        Math.abs(scale - prev.scale) > 0.003
      ) {
        prev.tx = tx;
        prev.ty = ty;
        prev.scale = scale;
        dom.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0px) scale(${scale.toFixed(3)})`;
      }

      if (!focusedTag) {
        const depthOpacity = 0.42 + depthFactor * 0.58;
        if (Number.isNaN(prev.opacity) || Math.abs(depthOpacity - prev.opacity) > 0.02) {
          prev.opacity = depthOpacity;
          dom.el.style.opacity = depthOpacity.toFixed(2);
        }
        const zTier = depthFactor > 0.66 ? 3 : depthFactor > 0.33 ? 2 : 1;
        if (prev.zTier !== zTier) {
          prev.zTier = zTier;
          dom.el.style.zIndex = String(zTier);
        }
      } else if (!Number.isNaN(prev.opacity)) {
        prev.opacity = Number.NaN;
        prev.zTier = -1;
        dom.el.style.opacity = '';
        dom.el.style.zIndex = '';
      }
    }
  };

  let rafId = 0;
  let lastClockMs = 0;
  let stepBank = 0;
  let elapsedSec = 0;
  let inViewport = true;
  let modalOpen = false;
  let isPointerDown = false;
  let isOrbitDragging = false;
  let suppressClickUntilMs = 0;

  const stopLoop = () => {
    if (rafId) {
      win.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    lastClockMs = 0;
  };

  const canRun = () => !disposed && !signal.aborted && !doc.hidden && inViewport && !modalOpen;

  const tick = (nowMs: number) => {
    rafId = 0;
    if (!canRun()) {
      lastClockMs = 0;
      return;
    }
    if (!lastClockMs) lastClockMs = nowMs;
    const dt = Math.min(0.1, Math.max(0, (nowMs - lastClockMs) / 1000));
    lastClockMs = nowMs;
    elapsedSec += dt;

    // Gentle ambient celestial drift when not actively dragging or hovering a star
    if (!isPointerDown && !focusedTag) {
      targetYaw += dt * 0.075;
    }

    if (!isPointerDown && (Math.abs(inertiaYaw) > 0.00005 || Math.abs(inertiaPitch) > 0.00005)) {
      targetYaw += inertiaYaw;
      targetPitch = Math.max(-1.18, Math.min(1.18, targetPitch + inertiaPitch));
      inertiaYaw *= 0.92;
      inertiaPitch *= 0.92;
    }

    yaw += (targetYaw - yaw) * 0.15;
    pitch += (targetPitch - pitch) * 0.15;
    const prevZoom = zoom;
    zoom += (targetZoom - zoom) * 0.16;
    if (Math.abs(zoom - prevZoom) > 0.002) {
      starUniforms.uZoom.value = zoom;
      options.onZoomChange?.(zoom);
    }

    if (!physicsSettled) {
      stepBank += dt;
      let steps = 0;
      let maxDisp = 1;
      while (stepBank >= STEP_SEC && steps < 5) {
        maxDisp = stepSphericalNebula(simNodes, links, sphereRadius, simAlpha, maxPairWeight);
        simAlpha *= 0.986;
        stepBank -= STEP_SEC;
        steps += 1;
      }
      if (steps > 0) {
        syncGeometryBuffers();
      }
      if (simAlpha <= 0.025 || (simAlpha < 0.35 && maxDisp < 0.045)) {
        physicsSettled = true;
      }
    }

    dustPoints.rotation.y = -elapsedSec * 0.025;
    filamentUniforms.uTime.value = elapsedSec;

    projectDomLabels();
    renderer.render(scene, camera);

    if (canRun()) {
      rafId = win.requestAnimationFrame(tick);
    }
  };

  const ensureLoop = () => {
    if (!rafId && canRun()) {
      lastClockMs = 0;
      rafId = win.requestAnimationFrame(tick);
    }
  };

  const highlight = (tagName: string | null) => {
    if (disposed) return;
    focusedTag = tagName;
    sky.classList.toggle('is-focused', Boolean(tagName));
    const near = tagName ? neighbours.get(tagName) ?? new Set<string>() : null;

    for (let i = 0; i < nodeCount; i += 1) {
      const dom = domNodes[i];
      const isOrigin = Boolean(tagName) && dom.name === tagName;
      const isLit = !tagName || isOrigin || near!.has(dom.name);
      dom.el.classList.toggle('is-origin', isOrigin);
      dom.el.classList.toggle('is-lit', Boolean(tagName) && isLit);
      dom.el.classList.toggle('is-dim', Boolean(tagName) && !isLit);

      if (!tagName) {
        starFocusState[i] = 0;
      } else if (isOrigin) {
        starFocusState[i] = 2;
      } else if (isLit) {
        starFocusState[i] = 1;
      } else {
        starFocusState[i] = -1;
      }
    }
    starFocusAttr.needsUpdate = true;

    for (let i = 0; i < links.length; i += 1) {
      const link = links[i];
      const aName = domNodes[link.aIndex].name;
      const bName = domNodes[link.bIndex].name;
      const connected = Boolean(tagName) && (aName === tagName || bName === tagName);
      const stateVal = !tagName ? 0 : connected ? 1 : -1;
      const flowVal = connected && bName === tagName ? -1 : 1;

      const baseOffset = i * vertexCountPerLink;
      for (let k = 0; k < vertexCountPerLink; k += 1) {
        filamentLitState[baseOffset + k] = stateVal;
        filamentFlowDir[baseOffset + k] = flowVal;
      }
    }
    filamentLitAttr.needsUpdate = true;
    filamentDirAttr.needsUpdate = true;

    if (!rafId && canRun()) {
      projectDomLabels();
      renderer.render(scene, camera);
    }
  };

  const resetView = () => {
    targetYaw = -0.22;
    targetPitch = 0.16;
    inertiaYaw = 0;
    inertiaPitch = 0;
    targetZoom = 1.0;
    ensureLoop();
  };

  // Pointer Orbit Rotation (zero layout reads inside pointermove!)
  let activePointerId = -1;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;

  sky.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (disposed || (e.pointerType === 'mouse' && e.button !== 0)) return;
      activePointerId = e.pointerId;
      isPointerDown = true;
      isOrbitDragging = false;
      downX = e.clientX;
      downY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      inertiaYaw = 0;
      inertiaPitch = 0;
    },
    { signal },
  );

  win.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      if (!isPointerDown || e.pointerId !== activePointerId || disposed) return;
      const totalMove = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (!isOrbitDragging && totalMove > 5) {
        isOrbitDragging = true;
        sky.classList.add('is-orbiting');
      }
      if (!isOrbitDragging) return;

      // Pure cached-width/height normalization — zero sync DOM layout reads!
      const invSpan = 1 / Math.max(240, Math.min(cachedWidth, cachedHeight));
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const dYaw = dx * invSpan * 3.1;
      const dPitch = dy * invSpan * 2.5;
      targetYaw += dYaw;
      targetPitch = Math.max(-1.18, Math.min(1.18, targetPitch + dPitch));
      inertiaYaw = inertiaYaw * 0.45 + dYaw * 0.55;
      inertiaPitch = inertiaPitch * 0.45 + dPitch * 0.55;
      ensureLoop();
    },
    { passive: true, signal },
  );

  const endPointerOrbit = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    if (isOrbitDragging) {
      suppressClickUntilMs = performance.now() + 180;
    }
    isPointerDown = false;
    isOrbitDragging = false;
    activePointerId = -1;
    sky.classList.remove('is-orbiting');
  };
  win.addEventListener('pointerup', endPointerOrbit, { passive: true, signal });
  win.addEventListener('pointercancel', endPointerOrbit, { passive: true, signal });

  // Prevent accidental link navigation right after dragging the 3D nebula
  sky.addEventListener(
    'click',
    (e: MouseEvent) => {
      if (performance.now() < suppressClickUntilMs) {
        e.preventDefault();
        e.stopPropagation();
        suppressClickUntilMs = 0;
      }
    },
    { capture: true, signal },
  );

  // Focal Wheel Zoom (zero sync DOM layout reads inside wheel!)
  sky.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (disposed || modalOpen) return;
      e.preventDefault();
      e.stopPropagation();
      const factor = Math.exp(-e.deltaY * 0.0011);
      targetZoom = Math.max(0.62, Math.min(1.85, targetZoom * factor));
      ensureLoop();
    },
    { passive: false, signal },
  );

  // Theme Uniform Sync (light / dark / moss / rice)
  const stopThemeObserver = observeThemePalette((nextPal) => {
    starUniforms.uInkColor.value.set(...nextPal.inkStrongRgb);
    starUniforms.uAccentColor.value.set(...nextPal.accentRgb);
    filamentUniforms.uInkColor.value.set(...nextPal.inkStrongRgb);
    filamentUniforms.uAccentColor.value.set(...nextPal.accentRgb);
    dustMaterial.color.setRGB(...nextPal.inkMidRgb);
    if (!rafId && canRun()) {
      renderer.render(scene, camera);
    }
  }, doc, win);

  // Cached ResizeObserver dimensions
  let resizeObserver: ResizeObserver | null = null;
  const ResizeObs = win.ResizeObserver ?? (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
  if (ResizeObs) {
    resizeObserver = new ResizeObs((entries) => {
      if (disposed) return;
      for (const entry of entries) {
        const cr = entry.contentRect;
        if (cr.width > 0 && cr.height > 0) {
          updateViewportSize(cr.width, cr.height);
        }
      }
      if (!rafId && canRun()) {
        projectDomLabels();
        renderer.render(scene, camera);
      }
    });
    resizeObserver.observe(sky);
  }

  // Viewport & Tab & Modal rAF Suspension
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
      { rootMargin: '100px 0px' },
    );
    io.observe(sky);
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
    sky.classList.remove('is-orbiting');

    // Clear 3D depth inline overrides so 2D SVG layout can take over cleanly
    for (let i = 0; i < domNodes.length; i += 1) {
      domNodes[i].el.style.opacity = '';
      domNodes[i].el.style.zIndex = '';
    }

    lastDisposeStats = disposeThreeHierarchy(scene);
    scene.clear();
    disposeWebGLRenderer(renderer);
    if (ownedCanvas && canvas?.parentElement === sky) {
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

  projectDomLabels();
  renderer.render(scene, camera);
  ensureLoop();

  return {
    active: true,
    fallback: false,
    isRunning: () => rafId !== 0,
    highlight,
    resetView,
    getZoom: () => zoom,
    dispose,
  };
}
