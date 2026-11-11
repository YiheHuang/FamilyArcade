import type { SfxVolume } from './sfx';

/**
 * 背景音乐：循环播放打包内的 CC0 古典乐（public/music/*.ogg）。
 * - 与音效一样，受浏览器自动播放策略限制：首次交互后才开始
 * - 窗口隐藏时自动暂停，回到前台继续；音量独立于音效
 * - 文件缺失时静默跳过（不影响其他功能）
 */

export const MUSIC_TRACKS = ['music/theme-1.ogg', 'music/theme-2.ogg', 'music/theme-3.ogg'];

const GAIN: Record<SfxVolume, number> = { low: 0.16, mid: 0.3, high: 0.46 };

interface MusicConfig {
  music: boolean;
  musicVolume: SfxVolume;
}

let cfg: MusicConfig = { music: true, musicVolume: 'low' };
let el: HTMLAudioElement | null = null;
let idx = 0;
let started = false;
let fadeTimer: ReturnType<typeof setInterval> | null = null;

export function configureMusic(next: Partial<MusicConfig>): void {
  cfg = { ...cfg, ...next };
  report();
  if (!el) return;
  el.volume = GAIN[cfg.musicVolume];
  if (!cfg.music) stop();
  else if (started && !document.hidden) void el.play().catch(() => {});
}

function fadeTo(target: number, ms = 600, onDone?: () => void): void {
  if (!el) return;
  if (fadeTimer) clearInterval(fadeTimer);
  const step = 30;
  const from = el.volume;
  const delta = target - from;
  if (Math.abs(delta) < 0.01) {
    el.volume = target;
    onDone?.();
    return;
  }
  let elapsed = 0;
  fadeTimer = setInterval(() => {
    elapsed += step;
    const k = Math.min(1, elapsed / ms);
    if (el) el.volume = Math.max(0, Math.min(1, from + delta * k));
    if (k >= 1) {
      if (fadeTimer) clearInterval(fadeTimer);
      fadeTimer = null;
      onDone?.();
    }
  }, step);
}

function load(i: number): void {
  if (!el) return;
  idx = i % MUSIC_TRACKS.length;
  el.src = MUSIC_TRACKS[idx]!;
  el.load();
}

function playCurrent(): void {
  if (!el) return;
  el.volume = 0;
  void el
    .play()
    .then(() => {
      if (el) fadeTo(GAIN[cfg.musicVolume]);
    })
    .catch(() => {
      /* 首次交互前的自动播放会被拒绝：等下一次交互再试 */
    });
}

/** 调试/自动化用：当前音乐状态（无法直接查询未挂载 DOM 的 Audio 元素） */
function report(): void {
  if (typeof window === 'undefined') return;
  (window as unknown as { __musicState?: unknown }).__musicState = {
    enabled: cfg.music,
    volume: cfg.musicVolume,
    playing: !!el && !el.paused && !el.ended,
    src: el?.src ?? '',
  };
}

function onEnded(): void {
  if (!el || !cfg.music) return;
  load(idx + 1);
  playCurrent();
}

function stop(): void {
  if (!el) return;
  const e = el;
  fadeTo(0, 400, () => e.pause());
}

function ensureElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (el) return el;
  el = new Audio();
  el.preload = 'auto';
  el.loop = false;
  el.crossOrigin = 'anonymous';
  el.addEventListener('ended', onEnded);
  el.addEventListener('playing', report);
  el.addEventListener('pause', report);
  el.addEventListener('error', () => {
    // 文件不存在或解码失败：静默跳过该曲目（不影响游戏）
    if (!el || !cfg.music) return;
    load(idx + 1);
    playCurrent();
  });
  load(0);
  return el;
}

/** 在 App 挂载时调用：首次交互后启动音乐，并处理窗口可见性 */
export function initMusic(): () => void {
  if (typeof window === 'undefined') return () => {};
  const start = (): void => {
    if (started) return;
    started = true;
    ensureElement();
    if (cfg.music && !document.hidden) playCurrent();
    setTimeout(report, 800);
  };
  const onVisible = (): void => {
    if (!cfg.music || !el || !started) return;
    if (document.hidden) el.pause();
    else void el.play().catch(() => {});
  };
  window.addEventListener('pointerdown', start, { capture: true });
  window.addEventListener('keydown', start, { capture: true });
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('pointerdown', start, { capture: true });
    window.removeEventListener('keydown', start, { capture: true });
    document.removeEventListener('visibilitychange', onVisible);
  };
}
