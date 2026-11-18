import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type * as THREE from 'three';
import {
  canUseWebGL,
  disposeThreeHierarchy,
  disposeWebGLRenderer,
  loadThree,
  observeThemePalette,
  resolveInkPalette,
} from '../../utils/threeInkStage.ts';
import type { DisposeStats } from '../../utils/threeInkStage.ts';

export type RenderPassId = 'ink-lit' | 'normal' | 'depth' | 'uv' | 'wireframe';
export type MeshPresetId = 'resonator' | 'crest' | 'heightfield';

export interface RenderPassMeta {
  id: RenderPassId;
  label: string;
  enLabel: string;
  shaderCode: number;
  stageTag: string;
  note: string;
}

export interface MeshPresetMeta {
  id: MeshPresetId;
  eid: string;
  name: string;
  csvNote: string;
  fallbackStats: {
    baseDrawCalls: number;
    triangles: number;
    vertices: number;
  };
}

export interface PipelineStats {
  drawCalls: number;
  triangles: number;
  vertices: number;
}

export interface ThreeDemoStageProps {
  title?: string;
  subtitle?: string;
  initialPass?: RenderPassId;
  initialPreset?: MeshPresetId;
  forceWebGL?: boolean;
  loadThreeImpl?: () => Promise<typeof import('three')>;
  createRenderer?: (
    threeModule: typeof import('three'),
    canvas: HTMLCanvasElement,
  ) => Pick<THREE.WebGLRenderer, 'setSize' | 'setPixelRatio' | 'render' | 'dispose'> & {
    info?: { render?: { calls?: number; triangles?: number } };
    renderLists?: { dispose?: () => void };
  };
  onDispose?: (stats: DisposeStats) => void;
}

export const RENDER_PASSES: ReadonlyArray<RenderPassMeta> = [
  {
    id: 'ink-lit',
    label: '墨韵着色',
    enLabel: 'Ink-Lit',
    shaderCode: 0,
    stageTag: 'PS · XuanInkToon',
    note: '三阶水墨明暗色阶 + 飞白边缘轮廓光，模拟东方式非真实感渲染 (NPR) 最终合成帧。',
  },
  {
    id: 'normal',
    label: '世界法线',
    enLabel: 'World Normal',
    shaderCode: 1,
    stageTag: 'VS/PS · N*0.5+0.5',
    note: '检视 CSV 还原 OBJ 后的世界空间顶点法线朝向，排查平滑组断裂与背面翻转。',
  },
  {
    id: 'depth',
    label: '线性深度',
    enLabel: 'Linear Depth',
    shaderCode: 2,
    stageTag: 'SV_Depth · LinearZ',
    note: '将透视非线性深度缓冲还原为视空间线性深度等高墨阶，核验近远裁剪面精度。',
  },
  {
    id: 'uv',
    label: 'UV 棋盘',
    enLabel: 'UV Checker',
    shaderCode: 3,
    stageTag: 'TEX0 · UV0 Mip0',
    note: '验证 VS Input 导出的 TEXCOORD0 展开密度与接缝，确保 Mip0 贴图在 Blender 中精准对齐。',
  },
  {
    id: 'wireframe',
    label: '拓扑线框',
    enLabel: 'Wireframe',
    shaderCode: 4,
    stageTag: 'IA · TriangleList',
    note: '直接透视索引缓冲 (Index Buffer) 重建出的三角面拓扑流向与顶点疏密分布。',
  },
];

export const MESH_PRESETS: ReadonlyArray<MeshPresetMeta> = [
  {
    id: 'resonator',
    eid: 'EID #1402',
    name: '共鸣晶核环 · TorusKnot',
    csvNote: 'VS Input: POSITION0 + NORMAL0 + TEXCOORD0 (双 SubMesh)',
    fallbackStats: {
      baseDrawCalls: 2,
      triangles: 2688,
      vertices: 1479,
    },
  },
  {
    id: 'crest',
    eid: 'EID #1847',
    name: '角色冠饰折面 · Creased Crest',
    csvNote: 'VS Input: 硬边折面拓扑 + 外环星轨几何体',
    fallbackStats: {
      baseDrawCalls: 2,
      triangles: 512,
      vertices: 362,
    },
  },
  {
    id: 'heightfield',
    eid: 'EID #2109',
    name: '山峦高度场 · Displaced Tile',
    csvNote: 'VS Input: 规则 UV0 网格顶点位移场 (单 DrawCall)',
    fallbackStats: {
      baseDrawCalls: 1,
      triangles: 2048,
      vertices: 1089,
    },
  },
];

export const INSPECTOR_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying float vViewZ;

void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPos = viewMatrix * worldPos;
  vViewZ = -mvPos.z;
  vViewDir = normalize(-mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

export const INSPECTOR_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

uniform int uPassMode;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform vec3 uPaperColor;
uniform vec3 uInkStrongColor;
uniform vec3 uInkMidColor;
uniform vec3 uAccentColor;

varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying float vViewZ;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(vViewDir);

  // Pass 1: World Normal (N * 0.5 + 0.5)
  if (uPassMode == 1) {
    vec3 normalViz = N * 0.5 + 0.5;
    float rim = pow(1.0 - max(0.0, dot(normalize(mat3(viewMatrix) * N), V)), 2.6);
    vec3 finalNormal = mix(normalViz, uInkStrongColor, rim * 0.18);
    gl_FragColor = vec4(finalNormal, 1.0);
    return;
  }

  // Pass 2: Linear Depth with subtle contour iso-lines
  if (uPassMode == 2) {
    float linDepth = clamp((vViewZ - uNear) / max(0.001, uFar - uNear), 0.0, 1.0);
    float nearWeight = 1.0 - linDepth;
    float iso = smoothstep(0.90, 0.98, abs(sin(linDepth * 36.0)));
    vec3 depthTone = mix(uPaperColor, uInkStrongColor, pow(nearWeight, 1.15));
    depthTone = mix(depthTone, uAccentColor, iso * 0.25);
    gl_FragColor = vec4(depthTone, 1.0);
    return;
  }

  // Pass 3: Monochrome UV0 Checkerboard (Mip0 alignment verifier)
  if (uPassMode == 3) {
    vec2 scaled = vUv * 12.0;
    vec2 cell = floor(scaled);
    float parity = mod(cell.x + cell.y, 2.0);
    vec2 subGrid = abs(fract(scaled * 2.0) - 0.5);
    float fineLine = 1.0 - smoothstep(0.44, 0.49, max(subGrid.x, subGrid.y));
    float seam = 1.0 - smoothstep(0.0, 0.025, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));

    vec3 lightTile = mix(uPaperColor, uInkMidColor, 0.08 + vUv.x * 0.14);
    vec3 darkTile = mix(uInkMidColor, uInkStrongColor, 0.48 + vUv.y * 0.28);
    vec3 checker = mix(lightTile, darkTile, parity);
    checker = mix(checker, uInkMidColor, (1.0 - fineLine) * 0.18);
    checker = mix(checker, uAccentColor, seam * 0.72);
    gl_FragColor = vec4(checker, 1.0);
    return;
  }

  // Pass 4: Pure Wireframe tone
  if (uPassMode == 4) {
    gl_FragColor = vec4(uInkStrongColor, 0.92);
    return;
  }

  // Pass 0 (Default): Eastern Xuan-Ink NPR Cel + Rim Shading
  vec3 keyDir = normalize(vec3(0.58, 0.74, 0.46));
  vec3 fillDir = normalize(vec3(-0.45, -0.25, 0.62));
  float ndl = dot(N, keyDir) * 0.5 + 0.5;
  float fill = max(0.0, dot(N, fillDir)) * 0.22;

  float grain = (hash12(gl_FragCoord.xy * 0.65 + fract(uTime * 0.01)) - 0.5) * 0.075;
  float bandInput = ndl + fill + grain;

  float shadowMask = 1.0 - smoothstep(0.36, 0.44, bandInput);
  float midMask = 1.0 - smoothstep(0.62, 0.72, bandInput);

  vec3 viewNormal = normalize(mat3(viewMatrix) * N);
  float fresnel = pow(1.0 - max(0.0, dot(viewNormal, V)), 2.5);
  float inkRim = smoothstep(0.46, 0.78, fresnel);

  vec3 litColor = mix(uPaperColor, uInkMidColor, midMask * 0.48);
  litColor = mix(litColor, uInkStrongColor, shadowMask * 0.78);
  litColor = mix(litColor, uInkStrongColor, inkRim * 0.85);

  gl_FragColor = vec4(litColor, 1.0);
}
`;

function countGeometryMetrics(geom: THREE.BufferGeometry): { vertices: number; triangles: number } {
  const pos = geom.getAttribute('position');
  const vertices = pos ? pos.count : 0;
  const idx = geom.getIndex();
  const triangles = idx ? Math.floor(idx.count / 3) : Math.floor(vertices / 3);
  return { vertices, triangles };
}

function buildPresetGeometries(
  THREE_MOD: typeof import('three'),
  preset: MeshPresetId,
): THREE.BufferGeometry[] {
  if (preset === 'crest') {
    const core = new THREE_MOD.IcosahedronGeometry(1.02, 2);
    const halo = new THREE_MOD.TorusGeometry(1.48, 0.055, 12, 64);
    halo.rotateX(Math.PI * 0.36);
    return [core, halo];
  }

  if (preset === 'heightfield') {
    const segs = 32;
    const plane = new THREE_MOD.PlaneGeometry(2.65, 2.65, segs, segs);
    plane.rotateX(-Math.PI * 0.44);
    const pos = plane.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z);
      const ridge =
        Math.cos(r * 3.1) * Math.exp(-r * 0.55) * 0.56 +
        Math.sin(x * 2.4 + z * 1.7) * 0.16;
      pos.setY(i, pos.getY(i) + ridge);
    }
    plane.computeVertexNormals();
    return [plane];
  }

  // Default: 'resonator'
  const knot = new THREE_MOD.TorusKnotGeometry(0.84, 0.27, 112, 18, 2, 3);
  const ring = new THREE_MOD.TorusGeometry(1.46, 0.038, 10, 56);
  ring.rotateY(Math.PI * 0.25);
  ring.rotateX(Math.PI * 0.42);
  return [knot, ring];
}

export default function ThreeDemoStage({
  title = 'RenderDoc · 抓帧网格与渲染通道检视台',
  subtitle = '模拟 CSV → OBJ 顶点重建后的多通道 Shader 检视（拖拽旋览 · 滚轮调焦）',
  initialPass = 'ink-lit',
  initialPreset = 'resonator',
  forceWebGL,
  loadThreeImpl,
  createRenderer,
  onDispose,
}: ThreeDemoStageProps) {
  const instanceId = useId();
  const prefersReduced = Boolean(useReducedMotion());

  const [activePass, setActivePass] = useState<RenderPassId>(initialPass);
  const [activePreset, setActivePreset] = useState<MeshPresetId>(initialPreset);
  const [wireframeOverlay, setWireframeOverlay] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(!prefersReduced);
  const [zoomPct, setZoomPct] = useState<number>(100);
  const [engineState, setEngineState] = useState<'loading' | 'webgl' | 'fallback'>('loading');
  const [measuredStats, setMeasuredStats] = useState<PipelineStats | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const controlsRef = useRef<{
    setPass: (pass: RenderPassId) => void;
    setPreset: (preset: MeshPresetId) => void;
    setWireframeOverlay: (enabled: boolean) => void;
    setAutoRotate: (enabled: boolean) => void;
    resetCamera: () => void;
  } | null>(null);

  const activePassMeta = useMemo(
    () => RENDER_PASSES.find((p) => p.id === activePass) ?? RENDER_PASSES[0],
    [activePass],
  );
  const activePresetMeta = useMemo(
    () => MESH_PRESETS.find((m) => m.id === activePreset) ?? MESH_PRESETS[0],
    [activePreset],
  );

  const computedFallbackStats = useMemo<PipelineStats>(() => {
    const base = activePresetMeta.fallbackStats;
    const extraWireCalls =
      wireframeOverlay && activePass !== 'wireframe' ? base.baseDrawCalls : 0;
    return {
      drawCalls: base.baseDrawCalls + extraWireCalls,
      triangles: base.triangles,
      vertices: base.vertices,
    };
  }, [activePresetMeta, wireframeOverlay, activePass]);

  const displayedStats = engineState === 'webgl' && measuredStats ? measuredStats : computedFallbackStats;

  useEffect(() => {
    const stageEl = stageRef.current;
    const canvasEl = canvasRef.current;
    if (!stageEl || !canvasEl) return;

    const webglOk =
      forceWebGL === true ||
      Boolean(createRenderer) ||
      canUseWebGL({ allowReducedMotion: true });

    if (!webglOk || forceWebGL === false) {
      setEngineState('fallback');
      return;
    }

    let disposed = false;
    const AbortCtrl = window.AbortController ?? AbortController;
    const abortController = new AbortCtrl();
    const { signal } = abortController;
    let cleanupFn: (() => void) | null = null;

    loadThree(loadThreeImpl)
      .then((THREE_MOD) => {
        if (disposed || !stageEl.isConnected) return;

        let renderer: Pick<THREE.WebGLRenderer, 'setSize' | 'setPixelRatio' | 'render' | 'dispose'> & {
          info?: { render?: { calls?: number; triangles?: number } };
          renderLists?: { dispose?: () => void };
        };

        try {
          renderer = createRenderer
            ? createRenderer(THREE_MOD, canvasEl)
            : new THREE_MOD.WebGLRenderer({
                canvas: canvasEl,
                alpha: true,
                antialias: true,
                powerPreference: 'high-performance',
              });
        } catch {
          setEngineState('fallback');
          return;
        }

        const palette = resolveInkPalette();
        const scene = new THREE_MOD.Scene();
        let cachedWidth = Math.max(260, stageEl.clientWidth || 640);
        let cachedHeight = Math.max(220, stageEl.clientHeight || 380);

        const camera = new THREE_MOD.PerspectiveCamera(40, cachedWidth / cachedHeight, 1.2, 9.2);
        const baseCamDist = 4.35;
        camera.position.set(0, 0.2, baseCamDist);

        const meshGroup = new THREE_MOD.Group();
        scene.add(meshGroup);

        const sharedUniforms = {
          uPassMode: { value: RENDER_PASSES.find((p) => p.id === activePass)?.shaderCode ?? 0 },
          uNear: { value: camera.near },
          uFar: { value: camera.far },
          uTime: { value: 0 },
          uPaperColor: { value: new THREE_MOD.Vector3(...palette.paperRgb) },
          uInkStrongColor: { value: new THREE_MOD.Vector3(...palette.inkStrongRgb) },
          uInkMidColor: { value: new THREE_MOD.Vector3(...palette.inkMidRgb) },
          uAccentColor: { value: new THREE_MOD.Vector3(...palette.accentRgb) },
        };

        const solidMaterial = new THREE_MOD.ShaderMaterial({
          vertexShader: INSPECTOR_VERTEX_SHADER,
          fragmentShader: INSPECTOR_FRAGMENT_SHADER,
          uniforms: sharedUniforms,
          wireframe: activePass === 'wireframe',
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });

        const overlayMaterial = new THREE_MOD.MeshBasicMaterial({
          color: new THREE_MOD.Color(...palette.inkStrongRgb),
          wireframe: true,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
        });

        let currentPassId: RenderPassId = activePass;
        let currentPresetId: MeshPresetId = activePreset;
        let currentOverlay: boolean = wireframeOverlay;
        let currentAutoRotate: boolean = autoRotate;
        let solidMeshes: THREE.Mesh[] = [];
        let wireMeshes: THREE.Mesh[] = [];
        let geomVertices = 0;
        let geomTriangles = 0;

        const updateHudStats = () => {
          const baseCalls = solidMeshes.length;
          const wireCalls =
            currentOverlay && currentPassId !== 'wireframe' ? wireMeshes.length : 0;
          const liveCalls = renderer.info?.render?.calls;
          const drawCalls =
            typeof liveCalls === 'number' && liveCalls > 0 ? liveCalls : baseCalls + wireCalls;
          setMeasuredStats({
            drawCalls,
            triangles: geomTriangles,
            vertices: geomVertices,
          });
        };

        const rebuildMeshes = (preset: MeshPresetId) => {
          // Dispose previous mesh geometries only (materials are shared across presets)
          for (const m of solidMeshes) {
            m.geometry.dispose();
            meshGroup.remove(m);
          }
          for (const w of wireMeshes) {
            meshGroup.remove(w);
          }
          solidMeshes = [];
          wireMeshes = [];
          geomVertices = 0;
          geomTriangles = 0;

          const geoms = buildPresetGeometries(THREE_MOD, preset);
          for (const g of geoms) {
            const counts = countGeometryMetrics(g);
            geomVertices += counts.vertices;
            geomTriangles += counts.triangles;

            const solid = new THREE_MOD.Mesh(g, solidMaterial);
            meshGroup.add(solid);
            solidMeshes.push(solid);

            const wire = new THREE_MOD.Mesh(g, overlayMaterial);
            wire.visible = currentOverlay && currentPassId !== 'wireframe';
            meshGroup.add(wire);
            wireMeshes.push(wire);
          }
        };

        rebuildMeshes(currentPresetId);

        const syncViewport = (w: number, h: number) => {
          cachedWidth = Math.max(240, Math.round(w));
          cachedHeight = Math.max(200, Math.round(h));
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          renderer.setPixelRatio(dpr);
          renderer.setSize(cachedWidth, cachedHeight, false);
          camera.aspect = cachedWidth / cachedHeight;
          camera.updateProjectionMatrix();
        };
        syncViewport(cachedWidth, cachedHeight);

        let yaw = 0.46;
        let pitch = 0.24;
        let targetYaw = 0.46;
        let targetPitch = 0.24;
        let zoom = 1.0;
        let targetZoom = 1.0;
        let isDragging = false;
        let pointerId = -1;
        let lastX = 0;
        let lastY = 0;
        let inViewport = true;
        let modalOpen = false;
        let rafId = 0;
        let lastClockMs = 0;
        let elapsedSec = 0;

        const renderSingleFrame = () => {
          if (disposed) return;
          meshGroup.rotation.set(pitch, yaw, 0);
          camera.position.set(0, 0.14, baseCamDist / Math.max(0.5, zoom));
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
          updateHudStats();
        };

        const stopLoop = () => {
          if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
          }
          lastClockMs = 0;
        };

        const needsContinuousTicks = () => {
          if (disposed || signal.aborted || document.hidden || !inViewport || modalOpen) {
            return false;
          }
          if (isDragging) return true;
          if (currentAutoRotate && !prefersReduced) return true;
          const settling =
            Math.abs(targetYaw - yaw) > 0.0008 ||
            Math.abs(targetPitch - pitch) > 0.0008 ||
            Math.abs(targetZoom - zoom) > 0.0008;
          return settling;
        };

        const tick = (nowMs: number) => {
          rafId = 0;
          if (disposed || signal.aborted || document.hidden || !inViewport || modalOpen) {
            lastClockMs = 0;
            return;
          }
          if (!lastClockMs) lastClockMs = nowMs;
          const dt = Math.min(0.1, Math.max(0, (nowMs - lastClockMs) / 1000));
          lastClockMs = nowMs;
          elapsedSec += dt;

          if (!isDragging && currentAutoRotate && !prefersReduced) {
            targetYaw += dt * 0.48;
          }

          yaw += (targetYaw - yaw) * 0.16;
          pitch += (targetPitch - pitch) * 0.16;
          const prevZoom = zoom;
          zoom += (targetZoom - zoom) * 0.18;
          if (Math.abs(zoom - prevZoom) > 0.004) {
            setZoomPct(Math.round(zoom * 100));
          }

          sharedUniforms.uTime.value = elapsedSec;
          renderSingleFrame();

          if (needsContinuousTicks()) {
            rafId = window.requestAnimationFrame(tick);
          }
        };

        const ensureLoop = () => {
          if (disposed || document.hidden || !inViewport || modalOpen) return;
          if (prefersReduced && !isDragging && Math.abs(targetZoom - zoom) <= 0.001) {
            yaw = targetYaw;
            pitch = targetPitch;
            zoom = targetZoom;
            renderSingleFrame();
            return;
          }
          if (!rafId) {
            lastClockMs = 0;
            rafId = window.requestAnimationFrame(tick);
          }
        };

        controlsRef.current = {
          setPass: (nextPass) => {
            currentPassId = nextPass;
            const meta = RENDER_PASSES.find((p) => p.id === nextPass) ?? RENDER_PASSES[0];
            sharedUniforms.uPassMode.value = meta.shaderCode;
            solidMaterial.wireframe = nextPass === 'wireframe';
            solidMaterial.needsUpdate = true;
            for (const w of wireMeshes) {
              w.visible = currentOverlay && nextPass !== 'wireframe';
            }
            renderSingleFrame();
            ensureLoop();
          },
          setPreset: (nextPreset) => {
            if (nextPreset === currentPresetId) return;
            currentPresetId = nextPreset;
            rebuildMeshes(nextPreset);
            renderSingleFrame();
            ensureLoop();
          },
          setWireframeOverlay: (enabled) => {
            currentOverlay = enabled;
            for (const w of wireMeshes) {
              w.visible = enabled && currentPassId !== 'wireframe';
            }
            renderSingleFrame();
            ensureLoop();
          },
          setAutoRotate: (enabled) => {
            currentAutoRotate = enabled;
            if (enabled) ensureLoop();
          },
          resetCamera: () => {
            targetYaw = 0.46;
            targetPitch = 0.24;
            targetZoom = 1.0;
            setZoomPct(100);
            ensureLoop();
          },
        };

        // Pointer Orbit Inspection (zero sync layout reads in pointermove!)
        stageEl.addEventListener(
          'pointerdown',
          (e: PointerEvent) => {
            if (disposed || (e.pointerType === 'mouse' && e.button !== 0)) return;
            isDragging = true;
            pointerId = e.pointerId;
            lastX = e.clientX;
            lastY = e.clientY;
            stageEl.classList.add('is-dragging');
            try {
              stageEl.setPointerCapture(e.pointerId);
            } catch {}
          },
          { signal },
        );

        window.addEventListener(
          'pointermove',
          (e: PointerEvent) => {
            if (!isDragging || e.pointerId !== pointerId || disposed) return;
            const invSpan = 1 / Math.max(220, Math.min(cachedWidth, cachedHeight));
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            targetYaw += dx * invSpan * 3.4;
            targetPitch = Math.max(-1.25, Math.min(1.25, targetPitch + dy * invSpan * 2.8));
            ensureLoop();
          },
          { passive: true, signal },
        );

        const stopDrag = (e: PointerEvent) => {
          if (e.pointerId !== pointerId) return;
          isDragging = false;
          pointerId = -1;
          stageEl.classList.remove('is-dragging');
          try {
            stageEl.releasePointerCapture(e.pointerId);
          } catch {}
          ensureLoop();
        };
        window.addEventListener('pointerup', stopDrag, { passive: true, signal });
        window.addEventListener('pointercancel', stopDrag, { passive: true, signal });

        // Focal Wheel Zoom (zero sync layout reads in wheel!)
        stageEl.addEventListener(
          'wheel',
          (e: WheelEvent) => {
            if (disposed || modalOpen) return;
            e.preventDefault();
            e.stopPropagation();
            const factor = Math.exp(-e.deltaY * 0.0012);
            targetZoom = Math.max(0.55, Math.min(2.0, targetZoom * factor));
            setZoomPct(Math.round(targetZoom * 100));
            ensureLoop();
          },
          { passive: false, signal },
        );

        const stopThemeObserver = observeThemePalette((nextPal) => {
          sharedUniforms.uPaperColor.value.set(...nextPal.paperRgb);
          sharedUniforms.uInkStrongColor.value.set(...nextPal.inkStrongRgb);
          sharedUniforms.uInkMidColor.value.set(...nextPal.inkMidRgb);
          sharedUniforms.uAccentColor.value.set(...nextPal.accentRgb);
          overlayMaterial.color.setRGB(...nextPal.inkStrongRgb);
          renderSingleFrame();
        });

        let ro: ResizeObserver | null = null;
        const ResizeObs =
          window.ResizeObserver ?? (typeof ResizeObserver !== 'undefined' ? ResizeObserver : undefined);
        if (ResizeObs) {
          ro = new ResizeObs((entries) => {
            if (disposed) return;
            for (const entry of entries) {
              const cr = entry.contentRect;
              if (cr.width > 0 && cr.height > 0) {
                syncViewport(cr.width, cr.height);
              }
            }
            renderSingleFrame();
          });
          ro.observe(stageEl);
        }

        let io: IntersectionObserver | null = null;
        const IntersectionObs =
          window.IntersectionObserver ??
          (typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : undefined);
        if (IntersectionObs) {
          io = new IntersectionObs(
            (entries) => {
              for (const entry of entries) {
                inViewport = entry.isIntersecting;
              }
              if (!inViewport) stopLoop();
              else ensureLoop();
            },
            { rootMargin: '80px 0px' },
          );
          io.observe(stageEl);
        }

        document.addEventListener(
          'visibilitychange',
          () => {
            if (document.hidden) stopLoop();
            else ensureLoop();
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
        window.addEventListener('app:modal-enter', onModalEnter, { signal });
        window.addEventListener('app:modal-leave', onModalLeave, { signal });
        document.addEventListener('app:modal-enter', onModalEnter, { signal });
        document.addEventListener('app:modal-leave', onModalLeave, { signal });

        setEngineState('webgl');
        renderSingleFrame();
        ensureLoop();

        cleanupFn = () => {
          stopLoop();
          stopThemeObserver();
          ro?.disconnect();
          io?.disconnect();
          controlsRef.current = null;
          // Ensure overlay & solid materials are disposed even if currently invisible
          const stats = disposeThreeHierarchy(scene);
          solidMaterial.dispose();
          overlayMaterial.dispose();
          scene.clear();
          disposeWebGLRenderer(renderer);
          onDispose?.({
            geometries: stats.geometries,
            materials: Math.max(stats.materials, 2),
            textures: stats.textures,
          });
        };
      })
      .catch(() => {
        if (!disposed) {
          setEngineState('fallback');
        }
      });

    return () => {
      disposed = true;
      abortController.abort();
      cleanupFn?.();
    };
  }, []);

  const handleSelectPass = (passId: RenderPassId) => {
    setActivePass(passId);
    controlsRef.current?.setPass(passId);
  };

  const handleSelectPreset = (presetId: MeshPresetId) => {
    setActivePreset(presetId);
    controlsRef.current?.setPreset(presetId);
  };

  const handleToggleWireframe = () => {
    setWireframeOverlay((prev) => {
      const next = !prev;
      controlsRef.current?.setWireframeOverlay(next);
      return next;
    });
  };

  const handleToggleRotate = () => {
    setAutoRotate((prev) => {
      const next = !prev;
      controlsRef.current?.setAutoRotate(next);
      return next;
    });
  };

  const handleResetCamera = () => {
    setZoomPct(100);
    controlsRef.current?.resetCamera();
  };

  return (
    <section
      className="three-demo-shell"
      data-three-demo-mounted="true"
      data-engine-state={engineState}
      aria-label={title}
    >
      <header className="three-demo-header">
        <div className="three-demo-heading">
          <div className="three-demo-kicker-row">
            <span className="three-demo-pill-badge">RENDERDOC · MESH &amp; PASS VIEWER</span>
            <span className="three-demo-stage-code">{activePassMeta.stageTag}</span>
          </div>
          <h3 className="three-demo-title">{title}</h3>
          <p className="three-demo-subtitle">{subtitle}</p>
        </div>

        <div className="three-demo-eid-bar" role="group" aria-label="切换 DrawCall 捕获事件">
          {MESH_PRESETS.map((preset) => {
            const isSelected = preset.id === activePreset;
            return (
              <button
                key={preset.id}
                type="button"
                className={`three-demo-eid-btn${isSelected ? ' is-selected' : ''}`}
                data-demo-preset={preset.id}
                aria-pressed={isSelected}
                onClick={() => handleSelectPreset(preset.id)}
              >
                <span className="three-demo-eid-tag">{preset.eid}</span>
                <span className="three-demo-eid-name">{preset.name.split(' · ')[0]}</span>
              </button>
            );
          })}
        </div>
      </header>

      <div
        className="three-demo-pass-tabs"
        role="tablist"
        aria-label="切换 GPU 渲染检视通道"
      >
        {RENDER_PASSES.map((pass) => {
          const isCurrent = pass.id === activePass;
          return (
            <button
              key={pass.id}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              data-demo-pass={pass.id}
              className={`three-demo-pass-btn${isCurrent ? ' is-active' : ''}`}
              onClick={() => handleSelectPass(pass.id)}
            >
              {isCurrent && (
                <motion.span
                  layoutId={`${instanceId}-pass-glider`}
                  className="three-demo-pass-glider"
                  aria-hidden="true"
                  transition={
                    prefersReduced
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 430, damping: 34, mass: 0.7 }
                  }
                />
              )}
              <span className="three-demo-pass-label">{pass.label}</span>
              <small className="three-demo-pass-en">{pass.enLabel}</small>
            </button>
          );
        })}
      </div>

      <div
        ref={stageRef}
        className="three-demo-viewport"
        data-lenis-prevent
        data-demo-viewport
      >
        <canvas
          ref={canvasRef}
          className="three-demo-canvas"
          data-demo-canvas
          aria-hidden="true"
        />

        {engineState === 'fallback' && (
          <div className="three-demo-fallback" data-demo-fallback>
            <svg
              className="three-demo-blueprint-svg"
              viewBox="0 0 320 180"
              fill="none"
              aria-hidden="true"
            >
              <ellipse cx="160" cy="90" rx="108" ry="42" stroke="currentColor" strokeOpacity="0.22" strokeDasharray="3 4" />
              <ellipse cx="160" cy="90" rx="46" ry="70" stroke="currentColor" strokeOpacity="0.26" />
              <polygon
                points="160,24 222,62 204,136 116,136 98,62"
                stroke="currentColor"
                strokeOpacity="0.62"
                strokeWidth="1.25"
              />
              <line x1="160" y1="24" x2="160" y2="156" stroke="currentColor" strokeOpacity="0.28" />
              <line x1="98" y1="62" x2="204" y2="136" stroke="currentColor" strokeOpacity="0.28" />
              <line x1="222" y1="62" x2="116" y2="136" stroke="currentColor" strokeOpacity="0.28" />
            </svg>
            <p className="three-demo-fallback-note">
              静态线框蓝图预览 · {activePresetMeta.name} · 当前检视：{activePassMeta.label}
            </p>
          </div>
        )}

        <div className="three-demo-hud" data-demo-hud aria-live="polite">
          <div className="three-demo-hud-metric">
            <span className="three-demo-hud-key">DrawCalls</span>
            <strong data-hud-drawcalls>{displayedStats.drawCalls}</strong>
          </div>
          <div className="three-demo-hud-metric">
            <span className="three-demo-hud-key">Triangles</span>
            <strong data-hud-triangles>{displayedStats.triangles.toLocaleString('en-US')}</strong>
          </div>
          <div className="three-demo-hud-metric">
            <span className="three-demo-hud-key">Vertices</span>
            <strong data-hud-vertices>{displayedStats.vertices.toLocaleString('en-US')}</strong>
          </div>
          <div className="three-demo-hud-metric">
            <span className="three-demo-hud-key">Zoom</span>
            <strong data-hud-zoom>{zoomPct}%</strong>
          </div>
        </div>
      </div>

      <footer className="three-demo-footer">
        <p className="three-demo-pass-desc">{activePassMeta.note}</p>

        <div className="three-demo-actions">
          <button
            type="button"
            className={`three-demo-toggle-btn${wireframeOverlay ? ' is-on' : ''}`}
            data-demo-wireframe-toggle
            aria-pressed={wireframeOverlay}
            disabled={activePass === 'wireframe'}
            onClick={handleToggleWireframe}
          >
            <span>叠加线框</span>
          </button>

          <button
            type="button"
            className={`three-demo-toggle-btn${autoRotate ? ' is-on' : ''}`}
            data-demo-rotate-toggle
            aria-pressed={autoRotate}
            onClick={handleToggleRotate}
          >
            <span>自动旋览</span>
          </button>

          <button
            type="button"
            className="three-demo-toggle-btn"
            data-demo-reset-btn
            onClick={handleResetCamera}
          >
            <span>视角归位</span>
          </button>
        </div>
      </footer>
    </section>
  );
}
