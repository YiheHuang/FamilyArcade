import { chooseMove } from './ai';
import type { AiLevel, GameState, Move } from '../game/types';

interface WorkerReply {
  requestId: number;
  move: Move | null;
}

export class AiClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (move: Move | null) => void>();
  private failed = false;

  private ensure(): Worker | null {
    if (this.failed) return null;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (event: MessageEvent<WorkerReply>) => {
          const resolve = this.pending.get(event.data.requestId);
          if (resolve) {
            this.pending.delete(event.data.requestId);
            resolve(event.data.move);
          }
        };
        this.worker.onerror = () => {
          this.failed = true;
          for (const resolve of this.pending.values()) resolve(null);
          this.pending.clear();
        };
      } catch {
        this.failed = true;
        return null;
      }
    }
    return this.worker;
  }

  choose(state: GameState, seat: number, level: AiLevel, budgetMs: number): Promise<Move | null> {
    const worker = this.ensure();
    const requestId = ++this.seq;
    if (!worker) {
      // Fallback for environments without workers (tests, old WebView).
      const move = chooseMove(state, seat, {
        level,
        budgetMs: Math.min(budgetMs, 150),
        rng: () => 0.5,
      });
      return Promise.resolve(move);
    }
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      worker.postMessage({
        requestId,
        state,
        seat,
        level,
        budgetMs,
        seed: Date.now() ^ (requestId * 2654435761),
      });
    });
  }

  cancelAll(): void {
    for (const resolve of this.pending.values()) resolve(null);
    this.pending.clear();
  }

  dispose(): void {
    this.cancelAll();
    this.worker?.terminate();
    this.worker = null;
  }
}
