import { applyMove, setupGame, type AiLevel, type GameState, type Move } from '@splendor/engine';

/**
 * 对局记录（本地 IndexedDB）：只存"种子 + 座位 + 全部走法"，回放时重演，
 * 因此每局记录仅几 KB，且天然可核对。
 */

export type RecordMode = 'local' | 'ai' | 'training' | 'lan';

export interface RecordSeat {
  name: string;
  kind: 'human' | 'ai';
  aiLevel?: AiLevel;
}

export interface GameRecord {
  id: string;
  mode: RecordMode;
  createdAt: number;
  finishedAt: number;
  seats: RecordSeat[];
  seed: string;
  moves: Move[];
  winners: number[];
  points: number[];
  turns: number;
}

const DB_NAME = 'splendor-records';
const STORE = 'games';
const MAX_RECORDS = 100;

function hasIdb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('finishedAt', 'finishedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
        t.oncomplete = () => db.close();
      }),
  );
}

export async function saveRecord(rec: GameRecord): Promise<void> {
  if (!hasIdb()) return;
  await tx('readwrite', (os) => os.put(rec) as IDBRequest<IDBValidKey>);
  // 超过上限时删掉最旧的
  const all = await listRecords();
  if (all.length > MAX_RECORDS) {
    for (const old of all.slice(MAX_RECORDS)) {
      await deleteRecord(old.id);
    }
  }
}

export async function listRecords(): Promise<GameRecord[]> {
  if (!hasIdb()) return [];
  const all = await tx<GameRecord[]>('readonly', (os) => os.getAll() as IDBRequest<GameRecord[]>);
  return all.sort((a, b) => b.finishedAt - a.finishedAt);
}

export async function getRecord(id: string): Promise<GameRecord | null> {
  if (!hasIdb()) return null;
  const rec = await tx<GameRecord | undefined>('readonly', (os) => os.get(id) as IDBRequest<GameRecord | undefined>);
  return rec ?? null;
}

export async function deleteRecord(id: string): Promise<void> {
  if (!hasIdb()) return;
  await tx('readwrite', (os) => os.delete(id) as IDBRequest<undefined>);
}

/** 回放帧：一步 = 一位玩家的一轮操作（含同回合内的归还/贵族选择） */
export interface ReplayFrame {
  state: GameState;
  moveCount: number;
}

export function buildFrames(rec: GameRecord): ReplayFrame[] {
  const state0 = setupGame(
    rec.seats.map((s) => ({ name: s.name, kind: s.kind, aiLevel: s.aiLevel ?? 'normal' })),
    { seed: rec.seed },
  );
  const frames: ReplayFrame[] = [{ state: state0, moveCount: 0 }];
  let cur = state0;
  for (let i = 0; i < rec.moves.length; i++) {
    const before = cur.current;
    const res = applyMove(cur, rec.moves[i]!);
    if (res.error) break;
    cur = res.state;
    const last = i === rec.moves.length - 1;
    if (cur.current !== before || cur.phase === 'ended' || last) {
      frames.push({ state: cur, moveCount: i + 1 });
    }
  }
  return frames;
}
