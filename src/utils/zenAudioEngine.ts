/**
 * 墨池听雨 · 极简白噪音伴读音频引擎 (Zen Reading & Rain Soundscape Engine)
 *
 * 特性:
 * 1. 四大文人意境音景:
 *    - 空山听雨（Mountain Rain / 屋檐雨声与落水点缀）
 *    - 深谷松风（Pine Breeze / 空灵松涛微风）
 *    - 寒夜翻书（Paper & Hearth / 宣纸轻翻与炭火微鸣）
 *    - 古寺清溪（Stream & Bell / 潺潺溪流与悠远空灵磬声）
 * 2. 纯 Web Audio API 程序化物理声学合成 (0 外部音频资源，0 网络依赖，无缝循环，超轻量)
 * 3. 增益平滑处理 (启动/切换 1.5s 淡入，暂停/停止 1.5s 淡出，防止杂音与瞬态爆音)
 * 4. Astro View Transitions 跨页无缝伴读全局单例
 * 5. 番茄钟/专注伴读时钟 (15/25/45/60 分钟定时自动淡出)
 */

export type SoundscapeId = 'rain' | 'wind' | 'paper' | 'stream';

export interface SoundscapeMeta {
  id: SoundscapeId;
  name: string;
  nameEn: string;
  desc: string;
  poem: string;
  icon: string;
}

export const SOUNDSCAPES: SoundscapeMeta[] = [
  {
    id: 'rain',
    name: '空山听雨',
    nameEn: 'Mountain Rain',
    desc: '屋檐雨声与落水点缀',
    poem: '一榻茶烟听雨声',
    icon: 'rain',
  },
  {
    id: 'wind',
    name: '深谷松风',
    nameEn: 'Pine Breeze',
    desc: '空灵松涛微风',
    poem: '松风吹解带，山月照弹琴',
    icon: 'wind',
  },
  {
    id: 'paper',
    name: '寒夜翻书',
    nameEn: 'Paper & Hearth',
    desc: '宣纸轻翻与炭火微鸣',
    poem: '寒夜读书忘却眠，锦衾香烬炉无烟',
    icon: 'paper',
  },
  {
    id: 'stream',
    name: '古寺清溪',
    nameEn: 'Stream & Bell',
    desc: '潺潺溪流与悠远空灵磬声',
    poem: '清泉石上流，古刹钟磐远',
    icon: 'stream',
  },
];

export interface ZenAudioState {
  isPlaying: boolean;
  currentScene: SoundscapeId;
  volume: number;
  timerDuration: number; // in minutes (0 means off)
  timerRemaining: number; // in seconds
}

export type StateListener = (state: ZenAudioState) => void;

/**
 * Paul Kellet 算法生成高品质粉红噪声 (1/f 衰减，平滑柔和的自然底噪)
 */
export function createPinkNoiseData(length: number): Float32Array {
  const data = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return data;
}

/**
 * 积分随机游走生成布朗噪声 (红噪声，1/f^2 衰减，低沉浑厚，适合风声与炭火)
 */
export function createBrownNoiseData(length: number): Float32Array {
  const data = new Float32Array(length);
  let lastOut = 0.0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
  return data;
}

/**
 * 白噪声生成器 (用于水滴冲击、炭火微爆和纸张翻页摩擦音)
 */
export function createWhiteNoiseData(length: number): Float32Array {
  const data = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return data;
}

/**
 * 消除缓冲区首尾接缝，确保 100% 无缝平滑循环
 */
export function loopSmoothBuffer(data: Float32Array, crossfadeSamples = 2048): void {
  const n = data.length;
  if (n <= crossfadeSamples * 2) return;
  const mid = (data[0] + data[n - 1]) * 0.5;
  for (let i = 0; i < crossfadeSamples; i++) {
    const weight = Math.sin((i / crossfadeSamples) * (Math.PI * 0.5));
    data[i] = mid * (1 - weight) + data[i] * weight;
    const tailIdx = n - 1 - i;
    data[tailIdx] = mid * (1 - weight) + data[tailIdx] * weight;
  }
}

interface ActiveSoundInstance {
  gainNode: GainNode;
  stop: (fadeDuration?: number) => void;
}

export class ZenAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private currentInstance: ActiveSoundInstance | null = null;
  private isPlaying = false;
  private currentScene: SoundscapeId = 'rain';
  private volume = 0.6;
  private timerDuration = 0; // minutes, 0 = off
  private timerRemaining = 0; // seconds
  private timerIntervalId: any = null;
  private listeners: Set<StateListener> = new Set();
  private isFading = false;

  constructor() {
    this.restorePersistedState();
  }

  private restorePersistedState(): void {
    if (typeof window === 'undefined') return;
    try {
      const savedScene = localStorage.getItem('zen-sound-scene') as SoundscapeId;
      if (savedScene && SOUNDSCAPES.some((s) => s.id === savedScene)) {
        this.currentScene = savedScene;
      }
      const savedVolume = localStorage.getItem('zen-sound-volume');
      if (savedVolume !== null) {
        const v = parseFloat(savedVolume);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          this.volume = v;
        }
      }
    } catch (e) {
      // Ignore storage errors in restricted contexts
    }
  }

  public getState(): ZenAudioState {
    return {
      isPlaying: this.isPlaying,
      currentScene: this.currentScene,
      volume: this.volume,
      timerDuration: this.timerDuration,
      timerRemaining: this.timerRemaining,
    };
  }

  public onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('[ZenAudio] Listener error:', err);
      }
    });
  }

  private ensureAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public async play(sceneId?: SoundscapeId): Promise<void> {
    if (sceneId && sceneId !== this.currentScene) {
      this.currentScene = sceneId;
      try {
        localStorage.setItem('zen-sound-scene', sceneId);
      } catch (e) {}
    }

    const ctx = this.ensureAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    // If already playing the same scene, ensure volume/fade is up
    if (this.isPlaying && this.currentInstance) {
      this.fadeInCurrent(1.2);
      this.notify();
      return;
    }

    // Stop old instance if any
    if (this.currentInstance) {
      this.currentInstance.stop(0.8);
      this.currentInstance = null;
    }

    this.isPlaying = true;
    this.currentInstance = this.createSoundscapeInstance(this.currentScene);
    this.fadeInCurrent(1.5);

    if (this.timerDuration > 0 && this.timerRemaining <= 0) {
      this.timerRemaining = this.timerDuration * 60;
    }
    this.startTimerInterval();
    this.notify();
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.stopTimerInterval();

    if (this.currentInstance && this.ctx) {
      const oldInstance = this.currentInstance;
      this.currentInstance = null;
      oldInstance.stop(1.5);
    }
    this.notify();
  }

  public toggle(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  public async setScene(sceneId: SoundscapeId): Promise<void> {
    if (this.currentScene === sceneId && this.isPlaying) return;
    this.currentScene = sceneId;
    try {
      localStorage.setItem('zen-sound-scene', sceneId);
    } catch (e) {}

    if (this.isPlaying) {
      // Crossfade: fade out old soundscape over 1.0s, fade in new soundscape over 1.5s
      const ctx = this.ensureAudioContext();
      if (this.currentInstance) {
        this.currentInstance.stop(1.0);
      }
      this.currentInstance = this.createSoundscapeInstance(sceneId);
      this.fadeInCurrent(1.5);
    }
    this.notify();
  }

  public setVolume(val: number): void {
    const num = typeof val === 'number' && Number.isFinite(val) ? val : 0;
    const clamped = Math.max(0, Math.min(1, num));
    this.volume = clamped;
    try {
      localStorage.setItem('zen-sound-volume', clamped.toString());
    } catch (e) {}

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.linearRampToValueAtTime(clamped, now + 0.05);
    }
    this.notify();
  }

  public setTimer(minutes: number): void {
    const safeMinutes = typeof minutes === 'number' && Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
    this.timerDuration = safeMinutes;
    if (safeMinutes > 0) {
      this.timerRemaining = Math.round(safeMinutes * 60);
      if (this.isPlaying) {
        this.startTimerInterval();
      }
    } else {
      this.timerRemaining = 0;
      this.stopTimerInterval();
    }
    this.notify();
  }

  private startTimerInterval(): void {
    this.stopTimerInterval();
    if (this.timerDuration <= 0) return;

    this.timerIntervalId = setInterval(() => {
      if (!this.isPlaying) {
        this.stopTimerInterval();
        return;
      }
      if (this.timerRemaining > 0) {
        this.timerRemaining--;
        this.notify();
      }
      if (this.timerRemaining <= 0) {
        // Timer reached zero: perform gentle 3-second fadeout and pause
        this.stopTimerInterval();
        this.onTimerCompleted();
      }
    }, 1000);
  }

  private stopTimerInterval(): void {
    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }
  }

  private onTimerCompleted(): void {
    // Play subtle soft chime to notify user of focus session completion
    this.playSoftCompletionChime();
    this.pause();
  }

  private playSoftCompletionChime(): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(528, now); // Solfeggio 528Hz healing pitch
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch (e) {}
      };

      osc.start(now);
      osc.stop(now + 3.6);
    } catch (e) {}
  }

  private fadeInCurrent(duration = 1.5): void {
    if (!this.currentInstance || !this.ctx) return;
    const now = this.ctx.currentTime;
    const g = this.currentInstance.gainNode.gain;
    const currentVal = Math.max(0.0001, g.value);
    if (typeof (g as any).cancelAndHoldAtTime === 'function') {
      try {
        (g as any).cancelAndHoldAtTime(now);
      } catch (e) {
        g.cancelScheduledValues(now);
        g.setValueAtTime(currentVal, now);
      }
    } else {
      g.cancelScheduledValues(now);
      g.setValueAtTime(currentVal, now);
    }
    const safeDuration = Math.max(0.05, duration);
    g.exponentialRampToValueAtTime(1.0, now + safeDuration);
  }

  /**
   * 工厂方法：实例化指定文人意境音景程序化声音图
   */
  private createSoundscapeInstance(sceneId: SoundscapeId): ActiveSoundInstance {
    const ctx = this.ensureAudioContext();
    const sceneGain = ctx.createGain();
    sceneGain.gain.setValueAtTime(0.0001, ctx.currentTime);
    sceneGain.connect(this.masterGain!);

    let stopFn: (fade?: number) => void;

    switch (sceneId) {
      case 'rain':
        stopFn = this.buildRainSoundscape(ctx, sceneGain);
        break;
      case 'wind':
        stopFn = this.buildWindSoundscape(ctx, sceneGain);
        break;
      case 'paper':
        stopFn = this.buildPaperSoundscape(ctx, sceneGain);
        break;
      case 'stream':
        stopFn = this.buildStreamSoundscape(ctx, sceneGain);
        break;
      default:
        stopFn = this.buildRainSoundscape(ctx, sceneGain);
        break;
    }

    return {
      gainNode: sceneGain,
      stop: (fade = 1.5) => {
        if (!this.ctx) {
          stopFn(0);
          return;
        }
        const now = this.ctx.currentTime;
        const currentVal = Math.max(0.0001, sceneGain.gain.value);
        if (typeof (sceneGain.gain as any).cancelAndHoldAtTime === 'function') {
          try {
            (sceneGain.gain as any).cancelAndHoldAtTime(now);
          } catch (e) {
            sceneGain.gain.cancelScheduledValues(now);
            sceneGain.gain.setValueAtTime(currentVal, now);
          }
        } else {
          sceneGain.gain.cancelScheduledValues(now);
          sceneGain.gain.setValueAtTime(currentVal, now);
        }
        const safeFade = Math.max(0.05, fade);
        sceneGain.gain.exponentialRampToValueAtTime(0.0001, now + safeFade);
        setTimeout(() => {
          stopFn(safeFade);
          try {
            sceneGain.disconnect();
          } catch (e) {}
        }, safeFade * 1000 + 50);
      },
    };
  }

  // =========================================================================
  // 1. 空山听雨（Mountain Rain / 屋檐雨声与落水点缀）
  // 声学架构：
  // 1) 双层远近雨幕底噪：
  //    - 远山阵雨层：低通 1200Hz + 慢速 0.12Hz LFO 调制呼吸起伏
  //    - 近景雨丝层：高通 2800Hz / 低通 4200Hz 轻柔细致沙沙声，消除单调单频粉噪感
  // 2) 瓦当青石物理水滴群：
  //    - 近景青石/屋檐瓦当滴答：800~1200Hz 空腔共振与沉稳圆润微顿音
  //    - 山叶落水：1500~2200Hz 清脆下掠水音
  //    - 随机立体声声像偏置，间歇节奏更自然连绵
  // =========================================================================
  private buildRainSoundscape(ctx: AudioContext, output: AudioNode): (fade?: number) => void {
    let isDisposed = false;
    const sampleRate = ctx.sampleRate;
    const bufferLen = sampleRate * 5; // 5-second seamless loop buffer

    // 1. 远山阵雨层：低频（低通 1200Hz）结合慢速（0.12Hz）LFO 模拟山风起伏雨幕与远山雨声呼吸起伏
    const distBuffer = ctx.createBuffer(2, bufferLen, sampleRate);
    const distLeft = createPinkNoiseData(bufferLen);
    const distRight = createPinkNoiseData(bufferLen);
    loopSmoothBuffer(distLeft);
    loopSmoothBuffer(distRight);
    distBuffer.getChannelData(0).set(distLeft);
    distBuffer.getChannelData(1).set(distRight);

    const distSource = ctx.createBufferSource();
    distSource.buffer = distBuffer;
    distSource.loop = true;

    const distHp = ctx.createBiquadFilter();
    distHp.type = 'highpass';
    distHp.frequency.setValueAtTime(140, ctx.currentTime);

    const distLp = ctx.createBiquadFilter();
    distLp.type = 'lowpass';
    distLp.frequency.setValueAtTime(1200, ctx.currentTime);
    distLp.Q.setValueAtTime(0.7, ctx.currentTime);

    const distGain = ctx.createGain();
    distGain.gain.setValueAtTime(0.58, ctx.currentTime);

    // 0.12Hz 慢速 LFO 模拟山风起伏雨幕与远山雨声呼吸起伏
    const distLfo = ctx.createOscillator();
    distLfo.type = 'sine';
    distLfo.frequency.setValueAtTime(0.12, ctx.currentTime);
    const distLfoGain = ctx.createGain();
    distLfoGain.gain.setValueAtTime(0.18, ctx.currentTime);
    distLfo.connect(distLfoGain);
    distLfoGain.connect(distGain.gain);

    distSource.connect(distHp);
    distHp.connect(distLp);
    distLp.connect(distGain);
    distGain.connect(output);

    // 2. 近景雨丝层：高频（带通 2800Hz~4200Hz）轻柔细致沙沙声，消除单调单频粉噪感
    const nearBuffer = ctx.createBuffer(2, bufferLen, sampleRate);
    const nearLeft = createPinkNoiseData(bufferLen);
    const nearRight = createPinkNoiseData(bufferLen);
    loopSmoothBuffer(nearLeft);
    loopSmoothBuffer(nearRight);
    nearBuffer.getChannelData(0).set(nearLeft);
    nearBuffer.getChannelData(1).set(nearRight);

    const nearSource = ctx.createBufferSource();
    nearSource.buffer = nearBuffer;
    nearSource.loop = true;

    const nearHp = ctx.createBiquadFilter();
    nearHp.type = 'highpass';
    nearHp.frequency.setValueAtTime(2800, ctx.currentTime);

    const nearLp = ctx.createBiquadFilter();
    nearLp.type = 'lowpass';
    nearLp.frequency.setValueAtTime(4200, ctx.currentTime);
    nearLp.Q.setValueAtTime(0.8, ctx.currentTime);

    const nearGain = ctx.createGain();
    nearGain.gain.setValueAtTime(0.32, ctx.currentTime);

    nearSource.connect(nearHp);
    nearHp.connect(nearLp);
    nearLp.connect(nearGain);
    nearGain.connect(output);

    distSource.start();
    nearSource.start();
    distLfo.start();

    // 3. 瓦当青石物理水滴调度器：连绵自然的间歇节奏 (380ms ~ 1250ms)
    let dropTimeout: any = null;
    let subDropTimeout: any = null;
    const scheduleDrop = () => {
      if (isDisposed) return;
      const delay = 380 + Math.random() * 870;
      dropTimeout = setTimeout(() => {
        if (isDisposed) return;
        this.synthesizeRainDrop(ctx, output);
        // 偶发屋檐连缀水滴 (滴答连缀，25% 概率)
        if (Math.random() < 0.25) {
          subDropTimeout = setTimeout(() => {
            if (!isDisposed) {
              this.synthesizeRainDrop(ctx, output);
            }
          }, 140 + Math.random() * 100);
        }
        scheduleDrop();
      }, delay);
    };
    scheduleDrop();

    return () => {
      isDisposed = true;
      if (dropTimeout) clearTimeout(dropTimeout);
      if (subDropTimeout) clearTimeout(subDropTimeout);
      try {
        distSource.stop();
        nearSource.stop();
        distLfo.stop();
        distSource.disconnect();
        nearSource.disconnect();
        distLfo.disconnect();
        distLfoGain.disconnect();
        distHp.disconnect();
        distLp.disconnect();
        distGain.disconnect();
        nearHp.disconnect();
        nearLp.disconnect();
        nearGain.disconnect();
      } catch (e) {}
    };
  }

  /**
   * 瓦当青石物理水滴群声学合成：
   * 分为：
   * 1) 近景青石/屋檐瓦当滴答：800~1200Hz 空腔共振与沉稳圆润微顿音
   * 2) 山叶落水：1500~2200Hz 清脆下掠水音
   * 均加入随机立体声声像偏置
   */
  private synthesizeRainDrop(ctx: AudioContext, output: AudioNode): void {
    try {
      const now = ctx.currentTime;
      const isStoneTile = Math.random() < 0.6; // 60% 瓦当青石，40% 山叶落水

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      if (isStoneTile) {
        // 近景青石/屋檐瓦当滴答：800~1200Hz 空腔共振与沉稳圆润微顿音
        const baseFreq = 820 + Math.random() * 360; // 820Hz ~ 1180Hz
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * 1.06, now);
        // 微下潜与圆润共振稳定
        osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.02);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(baseFreq, now);
        filter.Q.setValueAtTime(4.8, now); // 空腔共振峰

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.14 + Math.random() * 0.08, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);
      } else {
        // 山叶落水：1500~2200Hz 清脆下掠水音
        const baseFreq = 1550 + Math.random() * 600; // 1550Hz ~ 2150Hz
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, now);
        // 急速下掠水音
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.42, now + 0.045);

        filter.type = 'bandpass';
        // 关键修复：滤波器中心频跟随振荡器同步下掠，杜绝固定带通截断衰减与闷响
        filter.frequency.setValueAtTime(baseFreq, now);
        filter.frequency.exponentialRampToValueAtTime(baseFreq * 0.42, now + 0.045);
        filter.Q.setValueAtTime(3.6, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.10 + Math.random() * 0.06, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      }

      osc.connect(filter);
      filter.connect(gain);

      // 立体声声像随机偏置
      let panner: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.random() * 1.4 - 0.7, now);
        gain.connect(panner);
        panner.connect(output);
      } else {
        gain.connect(output);
      }

      const stopTime = isStoneTile ? now + 0.11 : now + 0.08;
      osc.onended = () => {
        try {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
          if (panner) panner.disconnect();
        } catch (e) {}
      };

      osc.start(now);
      osc.stop(stopTime);
    } catch (e) {}
  }

  // =========================================================================
  // 2. 深谷松风（Pine Breeze / 空灵松涛微风）
  // =========================================================================
  private buildWindSoundscape(ctx: AudioContext, output: AudioNode): (fade?: number) => void {
    const sampleRate = ctx.sampleRate;
    const bufferLen = sampleRate * 6;

    // Brownian Noise Buffer
    const buffer = ctx.createBuffer(2, bufferLen, sampleRate);
    const leftData = createBrownNoiseData(bufferLen);
    const rightData = createBrownNoiseData(bufferLen);
    loopSmoothBuffer(leftData);
    loopSmoothBuffer(rightData);
    buffer.getChannelData(0).set(leftData);
    buffer.getChannelData(1).set(rightData);

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // 峡谷主风带通滤波器 (Resonant Bandpass for Wind Howl/Swell)
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(280, ctx.currentTime);
    bp.Q.setValueAtTime(2.2, ctx.currentTime);

    // LFO 慢速正弦摆动模拟山风阵发性吹拂 (0.06Hz, 周期约 16 秒)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.06, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(140, ctx.currentTime); // 频率在 140Hz ~ 420Hz 间缓慢起伏
    lfo.connect(lfoGain);
    lfoGain.connect(bp.frequency);

    // 风声起伏增益 LFO (周期约 22 秒，模拟山风呼啸潮涨潮落)
    const breatheLfo = ctx.createOscillator();
    breatheLfo.type = 'sine';
    breatheLfo.frequency.setValueAtTime(0.045, ctx.currentTime);
    const breatheGain = ctx.createGain();
    breatheGain.gain.setValueAtTime(0.22, ctx.currentTime);

    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.68, ctx.currentTime);
    breatheLfo.connect(breatheGain);
    breatheGain.connect(windGain.gain);

    // 松针微风高频透气层 (Airy Pine Needles Layer via Pink Noise)
    const airBuffer = ctx.createBuffer(1, sampleRate * 3, sampleRate);
    const airData = createPinkNoiseData(sampleRate * 3);
    loopSmoothBuffer(airData);
    airBuffer.getChannelData(0).set(airData);

    const airSource = ctx.createBufferSource();
    airSource.buffer = airBuffer;
    airSource.loop = true;

    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'bandpass';
    airFilter.frequency.setValueAtTime(1250, ctx.currentTime);
    airFilter.Q.setValueAtTime(3.2, ctx.currentTime);

    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.18, ctx.currentTime);

    noiseSource.connect(bp);
    bp.connect(windGain);
    windGain.connect(output);

    airSource.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(output);

    noiseSource.start();
    airSource.start();
    lfo.start();
    breatheLfo.start();

    return () => {
      try {
        noiseSource.stop();
        airSource.stop();
        lfo.stop();
        breatheLfo.stop();
        noiseSource.disconnect();
        airSource.disconnect();
        lfo.disconnect();
        lfoGain.disconnect();
        breatheLfo.disconnect();
        breatheGain.disconnect();
        bp.disconnect();
        windGain.disconnect();
        airFilter.disconnect();
        airGain.disconnect();
      } catch (e) {}
    };
  }

  // =========================================================================
  // 3. 寒夜翻书（Paper & Hearth / 宣纸轻翻与炭火微鸣）
  // =========================================================================
  private buildPaperSoundscape(ctx: AudioContext, output: AudioNode): (fade?: number) => void {
    let isDisposed = false;
    const sampleRate = ctx.sampleRate;
    const bufferLen = sampleRate * 5;

    // 炭炉余温低频底噪 (Warm Hearth Rumble)
    const buffer = ctx.createBuffer(2, bufferLen, sampleRate);
    const leftData = createBrownNoiseData(bufferLen);
    const rightData = createBrownNoiseData(bufferLen);
    loopSmoothBuffer(leftData);
    loopSmoothBuffer(rightData);
    buffer.getChannelData(0).set(leftData);
    buffer.getChannelData(1).set(rightData);

    const hearthSource = ctx.createBufferSource();
    hearthSource.buffer = buffer;
    hearthSource.loop = true;

    const hearthFilter = ctx.createBiquadFilter();
    hearthFilter.type = 'lowpass';
    hearthFilter.frequency.setValueAtTime(260, ctx.currentTime);
    hearthFilter.Q.setValueAtTime(0.9, ctx.currentTime);

    const hearthGain = ctx.createGain();
    hearthGain.gain.setValueAtTime(0.38, ctx.currentTime);

    hearthSource.connect(hearthFilter);
    hearthFilter.connect(hearthGain);
    hearthGain.connect(output);
    hearthSource.start();

    // 炭火微鸣与偶发爆花调度器 (Fire Cracker Pops)
    let popTimeout: any = null;
    const schedulePops = () => {
      if (isDisposed) return;
      const delay = 180 + Math.random() * 380;
      popTimeout = setTimeout(() => {
        if (isDisposed) return;
        if (Math.random() < 0.75) {
          this.synthesizeEmbersPop(ctx, output);
        }
        schedulePops();
      }, delay);
    };
    schedulePops();

    // 宣纸翻书调度器 (Scholar Xuan Paper Rustle every 14-26 seconds)
    let paperTimeout: any = null;
    const schedulePaper = () => {
      if (isDisposed) return;
      const delay = 14000 + Math.random() * 12000;
      paperTimeout = setTimeout(() => {
        if (isDisposed) return;
        this.synthesizePaperTurn(ctx, output);
        schedulePaper();
      }, delay);
    };
    schedulePaper();

    return () => {
      isDisposed = true;
      if (popTimeout) clearTimeout(popTimeout);
      if (paperTimeout) clearTimeout(paperTimeout);
      try {
        hearthSource.stop();
        hearthSource.disconnect();
        hearthFilter.disconnect();
        hearthGain.disconnect();
      } catch (e) {}
    };
  }

  /**
   * 炭火爆花微鸣声学合成：极短高通脉冲 + 偶发微共鸣
   */
  private synthesizeEmbersPop(ctx: AudioContext, output: AudioNode): void {
    try {
      const now = ctx.currentTime;
      const duration = 0.015 + Math.random() * 0.02;
      const sampleCount = Math.floor(ctx.sampleRate * duration);
      const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleCount * 0.25));
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(2600 + Math.random() * 1200, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.04 + Math.random() * 0.16, now);

      source.connect(hp);
      hp.connect(gain);
      gain.connect(output);

      source.onended = () => {
        try {
          source.disconnect();
          hp.disconnect();
          gain.disconnect();
        } catch (e) {}
      };

      source.start(now);
      source.stop(now + duration + 0.01);
    } catch (e) {}
  }

  /**
   * 宣纸翻书声学合成：两段式带通摩擦包络 (抬起与抚平)
   */
  private synthesizePaperTurn(ctx: AudioContext, output: AudioNode): void {
    try {
      const now = ctx.currentTime;
      const totalLen = Math.floor(ctx.sampleRate * 0.7);
      const buffer = ctx.createBuffer(1, totalLen, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < totalLen; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2100, now);
      filter.Q.setValueAtTime(1.6, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      // 第一动：掀起书页 (0.0s ~ 0.18s)
      gain.gain.linearRampToValueAtTime(0.08, now + 0.06);
      gain.gain.linearRampToValueAtTime(0.02, now + 0.18);
      // 第二动：抚平宣纸 (0.22s ~ 0.55s)
      gain.gain.linearRampToValueAtTime(0.09, now + 0.32);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(output);

      source.onended = () => {
        try {
          source.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch (e) {}
      };

      source.start(now);
      source.stop(now + 0.7);
    } catch (e) {}
  }

  // =========================================================================
  // 4. 古寺清溪（Stream & Bell / 潺潺溪流与悠远空灵磬声）
  // 声学架构：
  // 1) 浅滩水幕底噪：平稳温润的石上水漫底噪（宽频低通 1800Hz + 带通 400Hz~1800Hz），彻底摆脱旧版的单调风管感
  // 2) 物理气泡群涌动：Minnaert 气泡谐振调度器 synthesizeStreamBubble，400~2800Hz 微水泡破裂密集连续触发（每 50~130ms）
  // 3) 古刹远磬：保持并优化 432Hz 铜磬泛音列与长余韵
  // =========================================================================
  private buildStreamSoundscape(ctx: AudioContext, output: AudioNode): (fade?: number) => void {
    let isDisposed = false;
    const sampleRate = ctx.sampleRate;
    const bufferLen = sampleRate * 5;

    // 1. 浅滩水幕底噪：平稳温润的石上水漫底噪 (立体声粉红噪声 + 400Hz~1800Hz 宽频平滑塑造)
    const buffer = ctx.createBuffer(2, bufferLen, sampleRate);
    const leftData = createPinkNoiseData(bufferLen);
    const rightData = createPinkNoiseData(bufferLen);
    loopSmoothBuffer(leftData);
    loopSmoothBuffer(rightData);
    buffer.getChannelData(0).set(leftData);
    buffer.getChannelData(1).set(rightData);

    const streamSource = ctx.createBufferSource();
    streamSource.buffer = buffer;
    streamSource.loop = true;

    // 高通滤波：切除 360Hz 以下沉闷低频，保留石上漫水轮廓
    const streamHp = ctx.createBiquadFilter();
    streamHp.type = 'highpass';
    streamHp.frequency.setValueAtTime(360, ctx.currentTime);

    // 低通滤波：切除 1800Hz 以上尖锐毛刺，使水流平稳温润
    const streamLp = ctx.createBiquadFilter();
    streamLp.type = 'lowpass';
    streamLp.frequency.setValueAtTime(1800, ctx.currentTime);
    streamLp.Q.setValueAtTime(0.65, ctx.currentTime);

    // 宽峰值滤波 (中心 850Hz，Q 1.0)：强化鹅卵石间水流漫过的主体水体声
    const streamBody = ctx.createBiquadFilter();
    streamBody.type = 'peaking';
    streamBody.frequency.setValueAtTime(850, ctx.currentTime);
    streamBody.Q.setValueAtTime(1.0, ctx.currentTime);
    streamBody.gain.setValueAtTime(2.5, ctx.currentTime);

    // 缓速慢波 LFO：0.07Hz 微澜轻涌，赋予溪水自然流动的有机生命力
    const streamLfo = ctx.createOscillator();
    streamLfo.type = 'sine';
    streamLfo.frequency.setValueAtTime(0.07, ctx.currentTime);
    const streamLfoGain = ctx.createGain();
    streamLfoGain.gain.setValueAtTime(0.08, ctx.currentTime);

    const streamWashGain = ctx.createGain();
    streamWashGain.gain.setValueAtTime(0.65, ctx.currentTime);
    streamLfo.connect(streamLfoGain);
    streamLfoGain.connect(streamWashGain.gain);

    streamSource.connect(streamHp);
    streamHp.connect(streamLp);
    streamLp.connect(streamBody);
    streamBody.connect(streamWashGain);
    streamWashGain.connect(output);

    streamSource.start();
    streamLfo.start();

    // 2. 物理气泡群涌动调度器：密集连续触发 (50ms ~ 130ms)，呈现生动逼真的“叮咚、咕嘟、淙淙”泉水穿石流水感
    let bubbleTimeout: any = null;
    let subBubbleTimeout: any = null;
    const scheduleBubble = () => {
      if (isDisposed) return;
      const delay = 50 + Math.random() * 80; // 50ms ~ 130ms 密集节奏
      bubbleTimeout = setTimeout(() => {
        if (isDisposed) return;
        this.synthesizeStreamBubble(ctx, output);
        // 偶发连珠双微泡 (20% 概率)
        if (Math.random() < 0.20) {
          subBubbleTimeout = setTimeout(() => {
            if (!isDisposed) {
              this.synthesizeStreamBubble(ctx, output);
            }
          }, 15 + Math.random() * 20);
        }
        scheduleBubble();
      }, delay);
    };
    scheduleBubble();

    // 3. 悠远古寺磬声调度器 (Zen Temple Bell / Singing Bowl Chime every 20-35s)
    let bellTimeout: any = null;
    const scheduleBell = () => {
      if (isDisposed) return;
      const delay = 20000 + Math.random() * 15000;
      bellTimeout = setTimeout(() => {
        if (isDisposed) return;
        this.synthesizeTempleBell(ctx, output);
        scheduleBell();
      }, delay);
    };
    scheduleBell();

    return () => {
      isDisposed = true;
      if (bubbleTimeout) clearTimeout(bubbleTimeout);
      if (subBubbleTimeout) clearTimeout(subBubbleTimeout);
      if (bellTimeout) clearTimeout(bellTimeout);
      try {
        streamSource.stop();
        streamLfo.stop();
        streamSource.disconnect();
        streamHp.disconnect();
        streamLp.disconnect();
        streamBody.disconnect();
        streamLfo.disconnect();
        streamLfoGain.disconnect();
        streamWashGain.disconnect();
      } catch (e) {}
    };
  }

  /**
   * 微水泡破裂物理声学合成 (Minnaert 气泡谐振 / Bubble Acoustics)：
   * 泉水穿石、激荡飞花时空气微泡产生与破裂的瞬态谐振：
   * 随机频率 400Hz~2800Hz，极短（8~20ms）指数衰减正弦脉冲，微向上掠频，立体声声像展开
   */
  private synthesizeStreamBubble(ctx: AudioContext, output: AudioNode): void {
    try {
      const now = ctx.currentTime;
      // 气泡物理共振频 (400Hz ~ 2800Hz，集中于 600~1900Hz 更有咕嘟淙淙感)
      // 使用幂次概率分布模拟真实微气泡尺径谱 (中频饱满，高频灵动，拒绝均匀分布的生硬感)
      const u = Math.random();
      const baseFreq = 400 + Math.pow(u, 1.25) * 2400;
      // 极短持续时间 8ms ~ 20ms
      const duration = 0.008 + Math.random() * 0.012;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq, now);
      // Minnaert 气泡微上掠频 (~9% 频移)，模拟气泡收缩破裂真实音色
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.09, now + duration);

      // 人耳等响度曲线补偿：高频气泡轻柔细碎，中低频气泡温润饱满，消除尖锐刺耳毛刺
      const loudnessWeight = Math.min(1.4, Math.max(0.65, Math.pow(1100 / baseFreq, 0.35)));
      const rawAmp = 0.035 + Math.random() * 0.045;
      const amp = rawAmp * loudnessWeight;

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(amp, now + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      let panner: StereoPannerNode | null = null;
      if (typeof ctx.createStereoPanner === 'function') {
        panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(Math.random() * 1.5 - 0.75, now);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(output);
      } else {
        osc.connect(gain);
        gain.connect(output);
      }

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
          if (panner) panner.disconnect();
        } catch (e) {}
      };

      osc.start(now);
      osc.stop(now + duration + 0.005);
    } catch (e) {}
  }

  /**
   * 古寺磬声物理泛音合成：
   * 基频 432Hz 禅意和声 + 2.76x 击打泛音 + 5.40x 磬体余光颤音 + 长达 6.5s 柔美指数衰减
   */
  private synthesizeTempleBell(ctx: AudioContext, output: AudioNode): void {
    try {
      const now = ctx.currentTime;
      const f0 = 432; // 经典禅意 432Hz 律音

      const bellMaster = ctx.createGain();
      bellMaster.gain.setValueAtTime(0.24, now);
      bellMaster.connect(output);

      // 泛音 1: 基频 (432Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(f0, now);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.linearRampToValueAtTime(0.8, now + 0.005);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 6.5);
      osc1.connect(gain1);
      gain1.connect(bellMaster);

      // 泛音 2: 铜磬击打声 (2.76 * f0 ≈ 1192Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(f0 * 2.76, now);
      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.linearRampToValueAtTime(0.35, now + 0.005);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
      osc2.connect(gain2);
      gain2.connect(bellMaster);

      // 泛音 3: 磬沿微颤光泽 (5.40 * f0 ≈ 2333Hz)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(f0 * 5.4, now);
      gain3.gain.setValueAtTime(0.0001, now);
      gain3.gain.linearRampToValueAtTime(0.15, now + 0.005);
      gain3.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      osc3.connect(gain3);
      gain3.connect(bellMaster);

      // 微拍频 (Detuning beating: 432.5Hz) 模拟天然铜器回荡余韵
      const oscBeat = ctx.createOscillator();
      const gainBeat = ctx.createGain();
      oscBeat.type = 'sine';
      oscBeat.frequency.setValueAtTime(f0 + 0.6, now);
      gainBeat.gain.setValueAtTime(0.0001, now);
      gainBeat.gain.linearRampToValueAtTime(0.25, now + 0.005);
      gainBeat.gain.exponentialRampToValueAtTime(0.0001, now + 5.5);
      oscBeat.connect(gainBeat);
      gainBeat.connect(bellMaster);

      osc1.onended = () => {
        try {
          osc1.disconnect();
          osc2.disconnect();
          osc3.disconnect();
          oscBeat.disconnect();
          gain1.disconnect();
          gain2.disconnect();
          gain3.disconnect();
          gainBeat.disconnect();
          bellMaster.disconnect();
        } catch (e) {}
      };

      osc1.start(now);
      osc2.start(now);
      osc3.start(now);
      oscBeat.start(now);

      osc1.stop(now + 6.6);
      osc2.stop(now + 3.3);
      osc3.stop(now + 1.6);
      oscBeat.stop(now + 5.6);
    } catch (e) {}
  }
}

/**
 * 全局单例管理器：跨 Astro View Transitions 页面切换保持声音连续播放
 */
declare global {
  interface Window {
    __zenAudioEngine?: ZenAudioEngine;
  }
}

export function getZenAudioEngine(): ZenAudioEngine {
  if (typeof window === 'undefined') {
    return new ZenAudioEngine();
  }
  if (!window.__zenAudioEngine) {
    window.__zenAudioEngine = new ZenAudioEngine();
  }
  return window.__zenAudioEngine;
}
