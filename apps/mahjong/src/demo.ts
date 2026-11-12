import {
  discard,
  setup,
  tileFromKey,
  winSelf,
  type GameState,
  type Seat,
  type Tile,
} from './game/mahjong';

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function t(key: string): Tile {
  const tile = tileFromKey(key);
  if (!tile) throw new Error(`bad demo tile ${key}`);
  return tile;
}

function hand(keys: string): Tile[] {
  return keys
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(t);
}

function base(seed: number): GameState {
  return setup({ rng: seeded(seed), dealer: 0, roundWind: 1, minimumFan: 1 });
}

/** A valid, completed self-draw hand used by the result screenshot and e2e. */
export function demoWin(): GameState {
  const state = base(20261112);
  const hands = state.hands.map((items) => items.slice());
  hands[0] = hand('m1 m2 m3 m4 m5 m6 m7 m8 m9 m5 m5 m5 m9 m9');
  const discards = [
    { seat: 0 as Seat, tile: t('p1'), claimed: false, last: false },
    { seat: 1 as Seat, tile: t('p9'), claimed: false, last: false },
    { seat: 2 as Seat, tile: t('s1'), claimed: false, last: false },
    { seat: 3 as Seat, tile: t('s9'), claimed: false, last: false },
    { seat: 1 as Seat, tile: t('z1'), claimed: false, last: false },
    { seat: 2 as Seat, tile: t('z2'), claimed: false, last: false },
    { seat: 3 as Seat, tile: t('p1'), claimed: false, last: false },
    { seat: 1 as Seat, tile: t('p2'), claimed: false, last: false },
  ];
  const withHands: GameState = {
    ...state,
    hands,
    discards,
    lastDraw: { seat: 0, tile: t('m9'), kong: false },
    turn: 0,
    phase: 'discard',
    lastDiscard: null,
    claim: null,
  };
  const result = winSelf(withHands, 0);
  return result.ok ? result.state : withHands;
}

/** A valid pending pong claim used by the claim and privacy screenshots. */
export function demoClaim(): GameState {
  const state = base(20261113);
  const hands = [
    hand('z7 z7 m1 m2 m4 m5 m7 m8 p1 p3 p5 s1 s3'),
    hand('p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z1'),
    hand('p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 s8 z2'),
    hand('z7 p1 p2 p4 p5 p7 p8 s1 s2 s4 s5 s7 z3 s9'),
  ];
  const discards = [
    { seat: 0 as Seat, tile: t('m9'), claimed: false, last: false },
    { seat: 1 as Seat, tile: t('p9'), claimed: false, last: false },
    { seat: 2 as Seat, tile: t('s1'), claimed: false, last: false },
    { seat: 0 as Seat, tile: t('p1'), claimed: false, last: false },
    { seat: 1 as Seat, tile: t('s9'), claimed: false, last: false },
  ];
  const prepared: GameState = {
    ...state,
    hands,
    discards,
    turn: 3,
    phase: 'discard',
    lastDraw: { seat: 3, tile: t('z3'), kong: false },
    lastDiscard: null,
    claim: null,
  };
  const result = discard(prepared, 3, 'z7');
  return result.ok ? result.state : prepared;
}
