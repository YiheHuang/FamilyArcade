import { choosePick } from './ai';
import type { AiLevel, GameView } from '../game/types';

interface WorkerReply {
  requestId: number;
  cardId: number | null;
}

export class AiClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, (cardId: number | null) => void>();
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
            resolve(event.data.cardId);
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

  choose(view: GameView, level: AiLevel, budgetMs: number): Promise<number | null> {
    const worker = this.ensure();
    const requestId = ++this.seq;
    if (!worker) {
      // Tests and very old WebViews: same evaluator, run on the UI thread.
      return Promise.resolve(choosePick(view, level, Math.min(budgetMs, 80), () => 0.5));
    }
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      worker.postMessage({
        requestId,
        view,
        level,
        budgetMs,
        seed: (Date.now() ^ (requestId * 2654435761)) >>> 0,
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
