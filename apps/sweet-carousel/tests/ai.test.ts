import { describe, expect, it } from 'vitest';
import { choosePick, explainPick } from '../src/ai/ai';
import { setupFromSeed, view } from '../src/game/engine';
import { mulberry32 } from '../src/game/rng';
import type { AiLevel, GameView } from '../src/game/types';
import { config } from './helpers';

const LEVELS: AiLevel[] = ['companion', 'easy', 'normal', 'hard'];

function baseView(): GameView {
  const state = setupFromSeed(config(2, 'ai-view'));
  return view(state, 0);
}

function withHand(view: GameView, patch: Partial<GameView>): GameView {
  return { ...view, ...patch };
}

describe('four AI levels', () => {
  it('always returns a card in the current hand', () => {
    for (const level of LEVELS) {
      for (let seed = 0; seed < 20; seed++) {
        const state = setupFromSeed(config(3, `ai-legal-${seed}`));
        const gameView = view(state, seed % 3);
        const card = choosePick(gameView, level, 80, mulberry32(seed + 1));
        expect(card).not.toBeNull();
        expect(gameView.myHand).toContain(card);
      }
    }
  });

  it('is deterministic for the same view, level and RNG seed', () => {
    for (const level of LEVELS) {
      const gameView = baseView();
      const a = choosePick(gameView, level, 80, mulberry32(42));
      const b = choosePick(gameView, level, 80, mulberry32(42));
      expect(a).toBe(b);
    }
  });

  it('returns null when there is nothing legal to pick', () => {
    const gameView = baseView();
    expect(choosePick(withHand(gameView, { myHand: [] }), 'normal', 80, mulberry32(1))).toBeNull();
    expect(choosePick(withHand(gameView, { phase: 'reveal' }), 'normal', 80, mulberry32(1))).toBeNull();
    expect(
      choosePick(withHand(gameView, { mySeat: null, myHand: [] }), 'normal', 80, mulberry32(1)),
    ).toBeNull();
  });

  it('finishes well inside the 80 ms budget on realistic views', () => {
    for (const level of LEVELS) {
      const state = setupFromSeed(config(5, `ai-budget-${level}`));
      const gameView = view(state, 0);
      const start = performance.now();
      for (let i = 0; i < 30; i++) {
        const card = choosePick(gameView, level, 80, mulberry32(i));
        expect(card).not.toBeNull();
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(80 * 30);
    }
  });
});

describe('Companion care', () => {
  function crafted(): GameView {
    const gameView = baseView();
    const seats = gameView.seats.map((seat) => ({ ...seat }));
    // We have two macarons already; taking the only macaron in hand completes a triple.
    seats[0] = { ...seats[0], roundCollected: [1, 2], collected: [1, 2] };
    // The human opponent also has two macarons and needs the last one.
    seats[1] = { ...seats[1], kind: 'human', roundCollected: [3, 4], collected: [3, 4] };
    return {
      ...gameView,
      mySeat: 0,
      myHand: [0, 12], // one macaron (would complete our triple), one tart
      myPending: null,
      phase: 'choosing',
      pickIndex: 6,
      seats,
    };
  }

  it('does not take a human opponent’s last needed card when another card is available', () => {
    const gameView = crafted();
    const card = choosePick(gameView, 'companion', 80, mulberry32(7));
    expect(card).toBe(12);
  });

  it('still takes the strong card when there is no alternative', () => {
    const gameView = crafted();
    gameView.myHand = [0];
    expect(choosePick(gameView, 'companion', 80, mulberry32(7))).toBe(0);
  });

  it('Hard is willing to deny the same card', () => {
    const gameView = crafted();
    expect(choosePick(gameView, 'hard', 80, mulberry32(7))).toBe(0);
  });
});

describe('hints explain themselves', () => {
  it('names the combo that the suggested card would complete', () => {
    const gameView = baseView();
    const seats = gameView.seats.map((seat) => ({ ...seat }));
    seats[0] = { ...seats[0], roundCollected: [1, 2], collected: [1, 2] };
    const hintView: GameView = { ...gameView, seats, myHand: [0, 12] };
    const reason = explainPick(hintView, 0);
    expect(reason.key).toBe('hint.triple');
    expect(reason.params?.dessert).toBe('macaron');
  });

  it('explains a pair, a sampler and a denial', () => {
    const gameView = baseView();
    const seats = gameView.seats.map((seat) => ({ ...seat }));
    seats[0] = { ...seats[0], roundCollected: [1], collected: [1] };
    seats[1] = { ...seats[1], roundCollected: [3], collected: [3] };
    const pairView: GameView = { ...gameView, seats, myHand: [0, 12] };
    expect(explainPick(pairView, 0).key).toBe('hint.pair');

    const samplerView: GameView = {
      ...gameView,
      seats: [
        { ...seats[0], roundCollected: [1, 13], collected: [1, 13] },
        seats[1],
      ],
      myHand: [0, 24],
    };
    expect(explainPick(samplerView, 24).key).toBe('hint.sampler');

    const denialView: GameView = {
      ...gameView,
      seats: [
        { ...seats[0], roundCollected: [], collected: [] },
        { ...seats[1], roundCollected: [3, 4, 5], collected: [3, 4, 5] },
      ],
      myHand: [0, 12],
    };
    expect(explainPick(denialView, 0).key).toBe('hint.deny');
  });
});
