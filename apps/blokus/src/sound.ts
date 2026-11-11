/**
 * Tiny zero-asset sound effects: everything is synthesized with WebAudio.
 *
 * Preferences live in localStorage (`blokus.sound`: normal | low | off).
 * The AudioContext is created lazily on the first sound after a user
 * gesture, so autoplay policies never complain.
 */

export type SoundMode = 'normal' | 'low' | 'off';

const STORAGE_KEY = 'blokus.sound';

let mode: SoundMode = 'normal';
let ctx: AudioContext | null = null;
const lastPlayedAt = new Map<string, number>();

export function initSound(): void {
  mode = 'normal';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'normal' || v === 'low' || v === 'off') mode = v;
  } catch {
    /* private mode */
  }
}

export function soundMode(): SoundMode {
  return mode;
}

/** cycle normal -> low -> off -> normal, persisting the choice */
export function cycleSoundMode(): SoundMode {
  mode = mode === 'normal' ? 'low' : mode === 'low' ? 'off' : 'normal';
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  return mode;
}

function masterVolume(): number {
  return mode === 'normal' ? 0.5 : mode === 'low' ? 0.16 : 0;
}

function ensureCtx(): AudioContext | null {
  if (masterVolume() === 0) return null;
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined);
  }
  return ctx;
}

/** one soft synthesized note */
function tone(
  freq: number,
  startOffset: number,
  dur: number,
  type: OscillatorType,
  peak: number,
): void {
  const ac = ensureCtx();
  if (!ac) return;
  const t0 = ac.currentTime + startOffset;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * masterVolume()), t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** throttle repeated sounds (e.g. invalid bids) */
function throttle(key: string, ms: number): boolean {
  const now = Date.now();
  const last = lastPlayedAt.get(key) ?? 0;
  if (now - last < ms) return false;
  lastPlayedAt.set(key, now);
  return true;
}

/** a piece landed on the board */
export function playPlace(): void {
  if (!throttle('place', 40)) return;
  tone(660, 0, 0.055, 'sine', 0.5);
  tone(495, 0.03, 0.07, 'sine', 0.32);
}

/** it is your turn again */
export function playTurn(): void {
  tone(784, 0, 0.09, 'sine', 0.4);
  tone(1046, 0.11, 0.14, 'sine', 0.42);
}

/** the action was rejected */
export function playInvalid(): void {
  if (!throttle('invalid', 600)) return;
  tone(196, 0, 0.09, 'square', 0.16);
}

/** the game ended */
export function playEnd(): void {
  tone(392, 0, 0.16, 'sine', 0.4);
  tone(523, 0.15, 0.16, 'sine', 0.4);
  tone(659, 0.3, 0.24, 'sine', 0.42);
}

/** someone placed all 21 pieces — a little fanfare */
export function playCelebrate(): void {
  const notes = [523, 659, 784, 988, 1175];
  notes.forEach((f, i) => tone(f, i * 0.085, 0.2, 'sine', 0.42));
}
