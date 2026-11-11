/**
 * Exports the real card set and the game moments used by the promo.
 *
 * Nothing on the board is hand-authored: every snapshot comes from the engine,
 * and every exported transition is replayed once more before it is written.
 *
 *   take  — rich4-6, turn 8, seat 3: three different gems
 *   buy   — rich4-6, turn 52, seat 3: a real tier-3 card, engine-computed payment
 *   wide  — rich4-6, turn 88: a full four-player table
 *   noble — noble2-10, turn 55, seat 0: Anne of Brittany arrives (+3)
 *
 * Run: npx tsx scripts/gen-data.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CARDS,
  NOBLES,
  applyMove,
  cardById,
  chooseMove,
  nobleById,
  setupGame,
  totalPoints,
  type AiLevel,
  type GameState,
  type Move,
} from "../../packages/engine/src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src", "data");
mkdirSync(outDir, { recursive: true });

interface Step {
  turn: number;
  seat: number;
  before: GameState;
  after: GameState;
  move: Move;
  events: ReturnType<typeof applyMove>["events"];
}

function play(seed: string, levels: AiLevel[]): Step[] {
  let state = setupGame(
    levels.map((level, i) => ({ name: `P${i + 1}`, kind: "ai" as const, aiLevel: level })),
    { seed },
  );
  const steps: Step[] = [];
  let guard = 0;
  while (state.phase !== "ended" && guard++ < 500) {
    const before = state;
    const move = chooseMove(state, levels[state.current] ?? "normal");
    const result = applyMove(state, move);
    if (result.error) throw new Error(`${seed}: ${result.error} at turn ${before.turn}`);
    steps.push({
      turn: before.turn,
      seat: before.current,
      before,
      after: result.state,
      move,
      events: result.events,
    });
    state = result.state;
  }
  return steps;
}

const FOUR = play("rich4-6", ["normal", "normal", "friendly", "easy"]);
const TWO = play("noble2-10", ["friendly", "friendly"]);

const find = (steps: Step[], label: string, test: (s: Step) => boolean): Step => {
  const step = steps.find(test);
  if (!step) throw new Error(`missing moment: ${label}`);
  return step;
};

const takeStep = find(
  FOUR,
  "take",
  (s) =>
    s.seat === 3 &&
    s.turn === 8 &&
    s.before.phase === "playing" &&
    s.after.phase === "playing" &&
    s.move.type === "take" &&
    s.move.colors.length === 3,
);
const buyStep = find(
  FOUR,
  "buy",
  (s) =>
    s.seat === 3 &&
    s.turn === 52 &&
    s.before.phase === "playing" &&
    s.after.phase === "playing" &&
    s.move.type === "buy" &&
    s.move.target.kind === "board",
);
const wideStep = find(
  FOUR,
  "wide",
  (s) => s.turn >= 88 && s.before.phase === "playing",
);
const nobleStep = find(
  TWO,
  "noble",
  (s) => s.turn === 55 && s.before.phase === "playing" && s.events.some((e) => e.type === "noble-visit"),
);

/** public-state snapshot: the video never sees the hidden deck order */
function snapshot(state: GameState) {
  return {
    turn: state.turn,
    current: state.current,
    phase: state.phase,
    finalRound: state.finalRound,
    winners: state.winners,
    bank: state.bank,
    board: state.board,
    deckCounts: state.decks.map((d) => d.length),
    nobles: state.nobles,
    players: state.players.map((p, i) => ({
      seat: p.seat,
      // the demo table is the family's hot-seat mode (four people);
      // the four AI levels appear as a real UI card in S8
      kind: "human",
      aiLevel: i === 2 ? "normal" : i === 3 ? "friendly" : "normal",
      tokens: p.tokens,
      bonuses: p.bonuses,
      cardPoints: p.cardPoints,
      purchased: p.purchased,
      reserved: p.reserved,
      nobles: p.nobles,
      points: totalPoints(p),
    })),
  };
}

function demo(step: Step) {
  const tokensTaken = step.events.find((e) => e.type === "tokens-taken");
  const bought = step.events.find((e) => e.type === "card-bought");
  const nobleEvent = step.events.find((e) => e.type === "noble-visit");
  const cardId =
    bought?.type === "card-bought"
      ? bought.cardId
      : step.move.type === "buy" && step.move.target.kind === "board"
        ? step.before.board[step.move.target.tier - 1]?.[step.move.target.slot]
        : null;
  const card = cardId == null ? null : cardById(cardId);
  const me = step.before.players[step.seat]!;
  const before = snapshot(step.before);
  const after = snapshot(step.after);
  return {
    turn: step.turn,
    seat: step.seat,
    move: step.move,
    before,
    after,
    taken: tokensTaken?.type === "tokens-taken" ? tokensTaken.tokens : null,
    paid: bought?.type === "card-bought" ? bought.paid : null,
    card: card
      ? {
          id: card.id,
          tier: card.tier,
          bonus: card.bonus,
          points: card.points,
          cost: card.cost,
          discount: (["white", "blue", "green", "red", "black"] as const).reduce(
            (sum, color) => sum + Math.min(card.cost[color], me.bonuses[color]),
            0,
          ),
        }
      : null,
    nobleId: nobleEvent?.type === "noble-visit" ? nobleEvent.nobleId : null,
    scoreBefore: before.players[step.seat]!.points,
    scoreAfter: after.players[step.seat]!.points,
  };
}

const take = demo(takeStep);
const buy = demo(buyStep);
const noble = demo(nobleStep);
const wide = snapshot(wideStep.before);

// ------------------------------------------------------------------ validate
function replay(state: GameState, move: Move, expected: GameState, label: string) {
  const out = applyMove(state, move);
  if (out.error) throw new Error(`${label}: ${out.error}`);
  const a = JSON.stringify(snapshot(out.state));
  const b = JSON.stringify(snapshot(expected));
  if (a !== b) throw new Error(`${label}: replay diverged`);
}

replay(takeStep.before, takeStep.move, takeStep.after, "take");
replay(buyStep.before, buyStep.move, buyStep.after, "buy");
replay(nobleStep.before, nobleStep.move, nobleStep.after, "noble");

if (!buy.card) throw new Error("buy demo has no card");
if (!noble.nobleId && noble.nobleId !== 0) throw new Error("noble demo has no noble");
const nobleDef = nobleById(noble.nobleId);
if (!noble.after.players[noble.seat]!.nobles.includes(nobleDef.id)) {
  throw new Error("noble demo: the noble did not land in the panel");
}

// -------------------------------------------------------------------- write
writeFileSync(
  join(outDir, "cards.json"),
  `${JSON.stringify({ version: 1, cards: CARDS, nobles: NOBLES }, null, 2)}\n`,
  "utf8",
);

writeFileSync(
  join(outDir, "game.json"),
  `${JSON.stringify(
    {
      take,
      buy,
      noble,
      wide,
      sources: {
        fourPlayer: "rich4-6",
        twoPlayerNoble: "noble2-10",
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`take  turn ${take.turn}: seat ${take.seat}, ${JSON.stringify(take.taken)}, score ${take.scoreBefore}`);
console.log(
  `buy   turn ${buy.turn}: seat ${buy.seat}, card #${buy.card.id} (t${buy.card.tier}, ${buy.card.points} pts), ` +
    `cost ${JSON.stringify(buy.card.cost)}, discount ${buy.card.discount}, paid ${JSON.stringify(buy.paid)}, ` +
    `score ${buy.scoreBefore}→${buy.scoreAfter}`,
);
console.log(
  `noble turn ${noble.turn}: seat ${noble.seat}, ${nobleDef.name} (+3), card #${noble.card?.id}, ` +
    `score ${noble.scoreBefore}→${noble.scoreAfter}`,
);
console.log(`wide  turn ${wide.turn}: scores ${wide.players.map((p) => p.points).join(", ")}`);
console.log(`cards ${CARDS.length}, nobles ${NOBLES.length} → ${outDir}`);
