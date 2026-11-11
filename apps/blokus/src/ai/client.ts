import { Game } from '../game/engine';
import { mulberry32 } from '../game/rng';
import type { PlaceMove, SerializedGame } from '../game/types';
import type { AiProvider } from '../session/session';
import type { AiRequest, AiResponse } from './protocol';
import { chooseMove } from './search';
import type { Difficulty } from './types';

function computeFallback(
  snapshot: SerializedGame,
  seat: number,
  difficulty: Difficulty,
  budgetMs: number,
  seed: number,
): PlaceMove | null {
  try {
    const g = Game.deserialize(snapshot);
    return chooseMove(g, seat, difficulty, Date.now() + budgetMs, mulberry32(seed));
  } catch (err) {
    console.error('AI 本地回退计算失败', err);
    return null;
  }
}

/** AI provider backed by a Web Worker, with an in-thread fallback. */
export class WorkerAi implements AiProvider {
  private worker: Worker | null = null;
  private seq = 1;
  private pending = new Map<number, (res: AiResponse) => void>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (ev: MessageEvent<AiResponse>) => {
        const cb = this.pending.get(ev.data.id);
        this.pending.delete(ev.data.id);
        cb?.(ev.data);
      };
      this.worker.onerror = () => {
        this.broken = true;
      };
    } catch {
      this.worker = null;
    }
  }

  private broken = false;

  chooseMove(
    snapshot: SerializedGame,
    seat: number,
    difficulty: Difficulty,
    budgetMs: number,
    seed?: number,
  ): Promise<PlaceMove | null> {
    // a fixed seed makes AI-vs-AI games reproducible (screenshots, tests)
    const usedSeed = seed ?? ((Math.random() * 0x7fffffff) | 0);
    if (!this.worker || this.broken) {
      return Promise.resolve(computeFallback(snapshot, seat, difficulty, budgetMs, usedSeed));
    }
    const id = this.seq++;
    return new Promise<PlaceMove | null>((resolve) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        resolve(computeFallback(snapshot, seat, difficulty, budgetMs, usedSeed));
      }, budgetMs + 4000);
      this.pending.set(id, (res) => {
        clearTimeout(timeout);
        resolve(res.move);
      });
      const req: AiRequest = {
        id,
        snapshot,
        seat,
        difficulty,
        budgetMs,
        seed: usedSeed,
      };
      this.worker?.postMessage(req);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}
