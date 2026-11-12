import {
  assignSpirit,
  makeDeck,
  scoreHand,
  type GameState,
  type Meld,
  type Tile,
  type WinInfo,
} from './game/nanchang-mahjong';

function remove(list: Tile[], tile: Tile): void {
  const index = list.indexOf(tile);
  if (index >= 0) list.splice(index, 1);
}

function meld(
  id: number,
  kind: 'chi' | 'peng',
  tiles: Tile[],
  owner: number,
  claimedFrom: number,
): Meld {
  return {
    id,
    kind,
    tiles: tiles.slice(),
    owner,
    claimedFrom,
    concealed: false,
    added: false,
    target: kind === 'peng' ? `peng:${tiles[0]}` : `chi:${tiles[0][0]}${Math.min(...tiles.map((tile) => Number(tile.slice(1))))}`,
    usedWild: false,
    spiritKong: false,
  };
}

export type DemoKind = 'mid' | 'end' | 'over';

export function makeDemoState(kind: DemoKind): GameState {
  const spirit = assignSpirit('m1', [3, 4], 6);
  const hands: Tile[][] = [
    ['m1', 'p3', 'p4', 'p6', 's2', 's5', 's7', 'z1'],
    ['m6', 'm7', 'm9', 'p1', 'p2', 'p8', 's3', 's6', 'z2', 'z6'],
    ['m2', 'm5', 'm8', 'p1', 'p4', 'p7', 's1', 's4', 's7', 'z1', 'z3', 'z4', 'z7'],
    ['m4', 'm8', 'p2', 'p5', 'p9', 's2', 's5', 's8', 'z2', 'z5', 'z6', 'z7', 'm9'],
  ];
  const melds: Meld[][] = [
    [meld(1, 'chi', ['m3', 'm4', 'm5'], 0, 3), meld(2, 'peng', ['z5', 'z5', 'z5'], 0, 2)],
    [meld(3, 'peng', ['p7', 'p7', 'p7'], 1, 3)],
    [],
    [],
  ];
  const discards: Tile[][] = [
    ['m9', 'p9', 's9', 'z4'],
    ['m3', 'p6', 's1', 'z1'],
    ['p2', 's6', 'z2', 'm7'],
    ['p3', 's3', 'z3', 'p8'],
  ];
  const used: Tile[] = [];
  for (const hand of hands) used.push(...hand);
  for (const list of melds) for (const item of list) used.push(...item.tiles);
  for (const list of discards) used.push(...list);
  const deck = makeDeck();
  for (const tile of used) remove(deck, tile);
  remove(deck, spirit.indicator);
  const liveWall = deck.slice(0, 33);
  const deadRest = deck.slice(33, 66);
  const deadWall = deadRest.slice();
  deadWall.splice(spirit.stackIndex * 2, 0, spirit.indicator);

  const base: GameState = {
    phase: 'discard',
    handNumber: 1,
    dealer: 0,
    turn: 0,
    hands,
    melds,
    discards,
    liveWall,
    deadWall,
    spirit,
    scores: [12, -4, 8, -16],
    matchTarget: 100,
    lastDiscard: { seat: 3, tile: 'p3' },
    lastClaim: null,
    claimQueue: [],
    claimIndex: 0,
    pendingKong: null,
    drawn: 'p6',
    kongPoints: [0, 0, 0, 0],
    flags: {
      heavenlyAvailable: false,
      kongDraw: false,
      firstDiscard: false,
      humanHandEligible: false,
      dealerFirstDiscard: false,
    },
    win: null,
    scoreSheet: null,
    matchWinner: null,
    version: 12,
  };

  if (kind === 'mid') return base;

  const win: WinInfo = {
    seat: 0,
    method: 'self-draw',
    from: null,
    tile: 'p6',
    pattern: 'basic',
    patterns: ['basic'],
    usedWild: true,
    spiritSingleWait: false,
    kongDraw: false,
    robbingKong: false,
    heavenly: false,
    human: false,
  };
  const sheet = scoreHand({
    scores: base.scores,
    dealer: base.dealer,
    winner: 0,
    method: win.method,
    pattern: win.pattern,
    patterns: win.patterns,
    spirit: base.spirit,
    hands: base.hands,
    melds: base.melds,
    kongPoints: base.kongPoints,
    usedWild: win.usedWild,
    spiritSingleWait: win.spiritSingleWait,
    kongDraw: win.kongDraw,
    from: null,
  });
  const endState: GameState = {
    ...base,
    phase: 'hand-over',
    turn: -1,
    win,
    scoreSheet: sheet,
    scores: sheet.scoresAfter,
    lastDiscard: null,
    drawn: null,
    version: 19,
  };
  if (kind === 'end') return endState;

  return {
    ...endState,
    phase: 'game-over',
    matchWinner: 0,
    scores: [103, 4, 12, -19],
    version: 22,
  };
}
