/**
 * zenStore.ts — 「墨池听雨」白噪音伴读与烟雨微气象响应式状态库 (Nanostores)
 *
 * 封装 `ZenAudioEngine` 状态机与面板开闭/烟雨画境控制：
 * - isPlaying: 是否正在播放白噪音
 * - sceneId: 当前选中音景 ('rain' | 'wind' | 'paper' | 'stream')
 * - volume: 主音量 (0 ~ 1)
 * - rainEnabled: 烟雨画境画布开关
 * - timerMinutes: 专注时钟设定分钟数 (0 | 15 | 25 | 45 | 60)
 * - remainingSeconds: 倒计时剩余秒数
 * - isOpen: 浮动胶囊面板展开状态
 */

import { atom, batch, computed } from 'nanostores';
import {
  SOUNDSCAPES,
  getZenAudioEngine,
  type SoundscapeId,
  type SoundscapeMeta,
  type ZenAudioEngine,
  type ZenAudioState,
} from '../utils/zenAudioEngine.ts';

export interface ZenDomEnv {
  doc?: Document | null;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

function resolveZenEnv(env?: ZenDomEnv): {
  doc: Document | null;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
} {
  const doc = env?.doc !== undefined ? env.doc : typeof document !== 'undefined' ? document : null;
  let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = null;
  if (env?.storage !== undefined) {
    storage = env.storage;
  } else if (typeof window !== 'undefined') {
    try {
      storage = window.localStorage ?? null;
    } catch {
      storage = null;
    }
  }
  return { doc, storage };
}

export const isPlaying = atom<boolean>(false);
export const sceneId = atom<SoundscapeId>('rain');
export const volume = atom<number>(0.6);
export const rainEnabled = atom<boolean>(true);
export const timerMinutes = atom<number>(0);
export const remainingSeconds = atom<number>(0);
export const isOpen = atom<boolean>(false);

export const activeSceneMeta = computed(
  sceneId,
  (id): SoundscapeMeta => SOUNDSCAPES.find((s) => s.id === id) ?? SOUNDSCAPES[0]
);

export const volumePercent = computed(volume, (v) => Math.round(Math.max(0, Math.min(1, v)) * 100));

export const formattedCountdown = computed(
  [timerMinutes, remainingSeconds],
  (mins, secs): string => {
    if (mins <= 0 || secs <= 0) return '--:--';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
);

export const zenStore = {
  isPlaying,
  sceneId,
  volume,
  rainEnabled,
  timerMinutes,
  remainingSeconds,
  isOpen,
  activeSceneMeta,
  volumePercent,
  formattedCountdown,
} as const;

export function syncFromZenEngineState(state: ZenAudioState): void {
  batch(() => {
    if (isPlaying.get() !== state.isPlaying) isPlaying.set(state.isPlaying);
    if (sceneId.get() !== state.currentScene) sceneId.set(state.currentScene);
    if (volume.get() !== state.volume) volume.set(state.volume);
    if (timerMinutes.get() !== state.timerDuration) timerMinutes.set(state.timerDuration);
    if (remainingSeconds.get() !== state.timerRemaining) remainingSeconds.set(state.timerRemaining);
  });
}

export function readInitialRainEnabled(env?: ZenDomEnv): boolean {
  const { doc, storage } = resolveZenEnv(env);
  if (doc?.documentElement?.getAttribute('data-zen-rain') === 'disabled') {
    return false;
  }
  try {
    if (storage?.getItem('zen-rain-disabled') === '1') {
      return false;
    }
  } catch {}
  return true;
}

export function bindZenAudioEngine(
  engine: ZenAudioEngine = getZenAudioEngine(),
  env?: ZenDomEnv
): () => void {
  const initialRain = readInitialRainEnabled(env);
  rainEnabled.set(initialRain);
  const unsubscribe = engine.onStateChange((state) => {
    syncFromZenEngineState(state);
  });
  return unsubscribe;
}

export function toggleZenPlayback(engine: ZenAudioEngine = getZenAudioEngine()): void {
  engine.toggle();
  syncFromZenEngineState(engine.getState());
}

export async function selectZenScene(
  nextSceneId: SoundscapeId,
  engine: ZenAudioEngine = getZenAudioEngine()
): Promise<void> {
  if (!engine.getState().isPlaying) {
    await engine.play(nextSceneId);
  } else {
    await engine.setScene(nextSceneId);
  }
  syncFromZenEngineState(engine.getState());
}

export function setZenVolume(
  nextVolume: number,
  engine: ZenAudioEngine = getZenAudioEngine()
): void {
  engine.setVolume(nextVolume);
  syncFromZenEngineState(engine.getState());
}

export function setZenTimerMinutes(
  minutes: number,
  engine: ZenAudioEngine = getZenAudioEngine()
): void {
  engine.setTimer(minutes);
  syncFromZenEngineState(engine.getState());
}

export function setZenRainEnabled(
  enabled: boolean,
  env?: ZenDomEnv,
  engine?: ZenAudioEngine
): boolean {
  const next = Boolean(enabled);
  const { doc, storage } = resolveZenEnv(env);
  if (next) {
    doc?.documentElement?.removeAttribute('data-zen-rain');
    try {
      storage?.removeItem('zen-rain-disabled');
    } catch {}
    const rainCanvas = doc?.getElementById('zenRainCanvas');
    const playing = engine ? engine.getState().isPlaying : isPlaying.get();
    if (rainCanvas && playing) {
      rainCanvas.classList.add('is-active');
    }
  } else {
    doc?.documentElement?.setAttribute('data-zen-rain', 'disabled');
    try {
      storage?.setItem('zen-rain-disabled', '1');
    } catch {}
    const rainCanvas = doc?.getElementById('zenRainCanvas');
    if (rainCanvas) {
      rainCanvas.classList.remove('is-active');
    }
  }
  rainEnabled.set(next);
  return next;
}

export function toggleZenRainEnabled(env?: ZenDomEnv, engine?: ZenAudioEngine): boolean {
  const { doc } = resolveZenEnv(env);
  const domDisabled = doc?.documentElement?.getAttribute('data-zen-rain') === 'disabled';
  const currentEnabled = doc?.documentElement ? !domDisabled : rainEnabled.get();
  return setZenRainEnabled(!currentEnabled, env, engine);
}

export function setZenCapsuleOpen(open: boolean): void {
  isOpen.set(Boolean(open));
}

export function toggleZenCapsuleOpen(): boolean {
  const next = !isOpen.get();
  isOpen.set(next);
  return next;
}

export function resetZenStore(): void {
  batch(() => {
    isPlaying.set(false);
    sceneId.set('rain');
    volume.set(0.6);
    rainEnabled.set(true);
    timerMinutes.set(0);
    remainingSeconds.set(0);
    isOpen.set(false);
  });
}
