/**
 * 合成音效（Web Audio）：零音频素材、零体积、无版权问题。
 * 设置（开关 / 音量档 / 按钮音）由 store 同步进来；开发与自动化测试可用 window.__sfxLog 观察。
 */

export type SfxId =
  | 'uiClick'
  | 'gemPick'
  | 'gemTake'
  | 'gemReturn'
  | 'buy'
  | 'reserve'
  | 'reserveGold'
  | 'noble'
  | 'finalRound'
  | 'yourTurn'
  | 'attention'
  | 'error'
  | 'undo'
  | 'tick'
  | 'timeout'
  | 'win'
  | 'lose';

export type SfxVolume = 'low' | 'mid' | 'high';

const VOLUME_GAIN: Record<SfxVolume, number> = { low: 0.32, mid: 0.58, high: 1 };

interface Tone {
  /** 起始频率 */
  f: number;
  /** 渐变到（可选） */
  to?: number;
  /** 时长（秒） */
  d: number;
  /** 波形 */
  t?: OscillatorType;
  /** 相对音量（0~1） */
  g?: number;
  /** 延迟（秒） */
  delay?: number;
}

interface Recipe {
  /** 整条音效的基础音量（0~1） */
  gain: number;
  tones: Tone[];
}

/** 音色表：短促、干净，偏"木牌/铃"的听感，避免电子味过重 */
const RECIPES: Record<SfxId, Recipe> = {
  uiClick: { gain: 0.14, tones: [{ f: 1400, d: 0.025, t: 'triangle', g: 0.5 }] },
  gemPick: { gain: 0.5, tones: [{ f: 900, to: 1250, d: 0.06, t: 'triangle', g: 0.6 }] },
  gemTake: { gain: 0.55, tones: [{ f: 520, d: 0.08, t: 'triangle' }, { f: 790, d: 0.13, delay: 0.055, t: 'sine' }] },
  gemReturn: { gain: 0.5, tones: [{ f: 620, to: 380, d: 0.14, t: 'sine', g: 0.7 }] },
  buy: { gain: 0.6, tones: [{ f: 523, d: 0.07, t: 'triangle' }, { f: 659, d: 0.07, delay: 0.065, t: 'triangle' }, { f: 784, d: 0.16, delay: 0.13, t: 'sine' }] },
  reserve: { gain: 0.5, tones: [{ f: 440, d: 0.09, t: 'triangle' }, { f: 587, d: 0.12, delay: 0.075, t: 'sine', g: 0.7 }] },
  reserveGold: { gain: 0.55, tones: [{ f: 660, d: 0.07, t: 'triangle' }, { f: 990, d: 0.18, delay: 0.06, t: 'sine', g: 0.55 }] },
  noble: { gain: 0.6, tones: [{ f: 523, d: 0.11, t: 'sine' }, { f: 659, d: 0.11, delay: 0.09, t: 'sine' }, { f: 880, d: 0.28, delay: 0.18, t: 'sine' }] },
  finalRound: { gain: 0.6, tones: [{ f: 392, d: 0.16, t: 'triangle' }, { f: 587, d: 0.3, delay: 0.15, t: 'sine' }] },
  yourTurn: { gain: 0.55, tones: [{ f: 740, d: 0.08, t: 'sine' }, { f: 988, d: 0.16, delay: 0.08, t: 'sine' }] },
  attention: { gain: 0.55, tones: [{ f: 660, d: 0.09, t: 'sine' }, { f: 660, d: 0.09, delay: 0.15, t: 'sine' }] },
  error: { gain: 0.5, tones: [{ f: 220, to: 165, d: 0.18, t: 'sawtooth', g: 0.28 }] },
  undo: { gain: 0.5, tones: [{ f: 600, to: 380, d: 0.14, t: 'triangle', g: 0.7 }] },
  tick: { gain: 0.5, tones: [{ f: 1250, d: 0.035, t: 'square', g: 0.22 }] },
  timeout: { gain: 0.65, tones: [{ f: 330, d: 0.2, t: 'triangle' }, { f: 262, d: 0.34, delay: 0.19, t: 'triangle' }] },
  win: { gain: 0.65, tones: [{ f: 523, d: 0.13, t: 'triangle' }, { f: 659, d: 0.13, delay: 0.11, t: 'triangle' }, { f: 784, d: 0.13, delay: 0.22, t: 'triangle' }, { f: 1047, d: 0.4, delay: 0.33, t: 'sine' }] },
  lose: { gain: 0.6, tones: [{ f: 440, d: 0.15, t: 'triangle' }, { f: 349, d: 0.15, delay: 0.13, t: 'triangle' }, { f: 262, d: 0.4, delay: 0.26, t: 'sine' }] },
};

export interface SfxConfig {
  sound: boolean;
  volume: SfxVolume;
  uiClicks: boolean;
}

let cfg: SfxConfig = { sound: true, volume: 'mid', uiClicks: true };
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

/** 由 store 同步设置（含初始加载） */
export function configureSfx(next: Partial<SfxConfig>): void {
  cfg = { ...cfg, ...next };
}

export function sfxConfig(): SfxConfig {
  return cfg;
}

function audioCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx;
  const AC = audioCtor();
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
  return ctx;
}

/** 浏览器自动播放策略：首次交互后解锁（在 App 挂载时调用一次） */
export function initSfx(): () => void {
  if (typeof window === 'undefined') return () => {};
  const unlock = (): void => {
    const c = ensureCtx();
    if (c && c.state === 'suspended') void c.resume();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  return () => {
    window.removeEventListener('pointerdown', unlock, { capture: true });
    window.removeEventListener('keydown', unlock, { capture: true });
  };
}

function logSfx(id: SfxId): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __sfxLog?: SfxId[] };
  const log = (w.__sfxLog ??= []);
  log.push(id);
  if (log.length > 120) log.splice(0, log.length - 120);
}

export function playSfx(id: SfxId, opts: { soft?: boolean } = {}): void {
  logSfx(id);
  if (!cfg.sound) return;
  if (id === 'uiClick' && !cfg.uiClicks) return;
  const c = ensureCtx();
  if (!c || !master) return;
  if (c.state === 'suspended') void c.resume();
  const recipe = RECIPES[id];
  const scale = recipe.gain * VOLUME_GAIN[cfg.volume] * (opts.soft ? 0.4 : 1);
  const t0 = c.currentTime + 0.012;
  for (const tone of recipe.tones) {
    const gain = c.createGain();
    const amp = Math.max(0.0001, scale * (tone.g ?? 1) * 0.5);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(amp, t0 + (tone.delay ?? 0) + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (tone.delay ?? 0) + tone.d);
    gain.connect(master);
    const osc = c.createOscillator();
    osc.type = tone.t ?? 'triangle';
    osc.frequency.setValueAtTime(Math.max(30, tone.f), t0 + (tone.delay ?? 0));
    if (tone.to != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, tone.to), t0 + (tone.delay ?? 0) + tone.d);
    }
    osc.connect(gain);
    osc.start(t0 + (tone.delay ?? 0));
    osc.stop(t0 + (tone.delay ?? 0) + tone.d + 0.03);
  }
}

/**
 * 给所有纯界面按钮挂极轻的点击音；触发游戏操作的按钮请加 data-sfx="off"，
 * 由事件音效统一发声，避免叠音。
 */
export function installUiClickSounds(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    const el = target?.closest?.('button, [role="button"], label, input[type="checkbox"]');
    if (!el || el.closest('[data-sfx="off"]')) return;
    playSfx('uiClick');
  };
  window.addEventListener('click', onClick, true);
  return () => window.removeEventListener('click', onClick, true);
}
