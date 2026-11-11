# Rules audit — Balloon Rally v0.1

Every published rule points to the code that implements it and to at least one test. If a rule has no test row, treat it as not implemented.

**Rule source of truth:** `data/course.json` + `src/game/engine.ts`. `npm run data:verify` and `npm run check` are the gates.

## Core audit table

| # | Rule (player-facing) | Code | Test(s) | Edge cases |
| --- | --- | --- | --- | --- |
| R1 | Five neutral balloons, a 20-space track, four rounds. | `data/course.json`; `src/game/data.ts` (`BALLOONS`, `TRACK_LENGTH`, `ROUNDS`); `src/game/engine.ts` `setup` | `tests/data.test.ts` › “has five original balloons, 20 spaces, five winds and four rounds”; `tests/engine.test.ts` › “starts five balloons at zero, four rounds, and two tailwind tokens each” | All balloons start at 0; count/source/version checked; movement capped at 20. |
| R2 | 2–6 players; each seat has a name and human/AI kind. | `setup` player-count guard; `GameConfig` in `src/game/types.ts`; `src/ui/Setup.tsx` | `tests/engine.test.ts` › “rejects bad seat counts”; `tests/ai.test.ts` › “works for 2–6 seats”; E2E setup | At least one human is required; names trimmed and capped at 20 by the engine; UI caps at 16. |
| R3 | Each round every player secretly supports one balloon. | `state.supports`; `resolveRound`; `view` in `src/game/engine.ts` | `tests/engine.test.ts` › “keeps the first player support out of the next player view”; “lets a player see only their own locked support”; `tests/simulation.test.ts` › “keeps hidden wind plans out of every player view” | Support entry is seat-ordered for UI purposes, but a player's view never contains another seat's current support. AI uses the same `view`. |
| R4 | A round resolves after the last seat has chosen; supports are then public. | `apply` last-seat branch → `resolveRound`; `history` | “moves from support to summary to the next round”; “reveals all supports and winds in the round summary” | Summary phase has `current = -1`; supports stay public in history. |
| R5 | Each player has two tailwind tokens per rally; one may be spent before reveal to add +1 to the supported balloon. | `TAILWIND_PER_PLAYER`; `apply` tailwind branch; `resolveRound` tailwind count | “spends one token and adds exactly one space”; “stacks tailwinds from two supporters on the same balloon”; “rejects a tailwind when none is left” | At most one token per round because each seat makes one support choice. Two supporters on the same balloon stack. Tokens are conserved and restored by undo/snapshot. |
| R6 | Shuffle the five wind cards (1–3) and assign one per balloon each round; future assignments are hidden. | `setup` → `windPlan`; `shuffled` in `src/game/rng.ts`; `view` strips `windPlan` | “uses the exact wind deck in every round”; “keeps hidden wind plans out of every player view” | Deck is exactly `[1,2,2,3,3]` every round. No `Math.random`; injected seeded RNG only. |
| R7 | Movement = wind card + all tailwinds on that balloon; cap at 20. | `resolveRound` in `src/game/engine.ts` | “moves every balloon by its own wind card”; “caps a balloon at the finish line” | No finish bonus; multiple balloons can share space 20 and tie. |
| R8 | Round leader's backers score 3; the next distinct position's backers score 1; ties all score. | `resolveRound` (`leaders`, `seconds`, `points`); `score` | “scores the leader 3 and the next distinct balloon 1”; “gives every tied leader 3 points and every tied second 1 point”; “has no second place when every balloon ties for the lead” | If all five tie, there is no second. A player never scores both 3 and 1 in one round. |
| R9 | After round 4, backers of the overall leader(s) score 5. | `resolveRound` final-round branch (`overallLeaders`, `overallPoints`) | “awards the final overall leader bonus after four rounds” | Bonus applies to each seat whose **round-4 support** is an overall leader, including ties. Earlier supports do not pay again. |
| R10 | Each unused tailwind token is worth 1 point. | `score` → `tailwindPoints = tokensLeft` | “adds one point per unused tailwind token”; “breaks ties by correct rounds, then remaining tailwind, then shares” | Included in the live total; spending a token removes 1 point but can gain 1–3 round points or 5 overall points. |
| R11 | Highest total wins. Ties: most correct round supports, then most tailwind left, then shared win. | `score` sort + competition ranking; `result` winners = rank 1 | “breaks ties by correct rounds, then remaining tailwind, then shares”; “declares shared winners when every tie-break matches” | Correct support means the supported balloon was a **round leader** (3-point hit), not second and not overall. Ranks use 1,1,3 competition ranking. |
| R12 | The rally ends after round 4 and the summary is advanced. | `apply` advance branch; `result` requires `phase === 'ended'` | “moves from support to summary to the next round”; “rejects every action after the rally ends” | No early end; no per-round early termination. A hard cap is unnecessary because 4 rounds are fixed. |
| R13 | Illegal actions return stable, explainable codes. | `ErrorCode`; `apply`; `errorTextKey` | “returns stable reason codes”; “rejects a seat that has already locked”; “rejects every action after the rally ends” | Codes: `game-over`, `wrong-phase`, `not-your-turn`, `bad-seat`, `bad-balloon`, `already-supported`, `no-tailwind`, `bad-move`. UI translates `error.*`; it never reimplements the rule. |
| R14 | Every action keeps conservation and phase invariants. | `invariants` in `src/game/engine.ts` | “keeps the invariant clean through a complete scripted rally”; 120-game simulation checks every step | Tokens spent + left = 2; wind rows equal the deck; history rounds sequential; positions match the last round; supports only for the current/previous phase. |
| R15 | Same seed + same moves = same state; saves are versioned and replayable. | `src/game/replay.ts` (`serialize`, `deserialize`, `replay`, `rngForConfig`); `windPlan` stored in state | “is deterministic for the same seed and moves”; “serializes, sanitizes and replays the same rally”; “round-trips serialization and replays real move logs” | Save version `1`; corrupted saves throw readable errors; no time or `Math.random` in the engine. |
| R16 | AI only sees the player view, returns legal moves, and respects budgets. | `src/ai/ai.ts`; `src/ai/worker.ts`; `src/ai/client.ts`; `view` | `tests/ai.test.ts` › “always returns a legal support for every level”; “keeps every decision inside the 80 ms budget”; “is deterministic when given the same view and seed” | Worker failure falls back to a synchronous legal choice; UI falls back to the first legal support. |
| R17 | Companion does not take a child's favourite balloon. | `favouriteBalloons` + exclusion in `src/ai/ai.ts` | “avoids the balloon a human has supported twice” | A “favourite” is a balloon a human seat has supported at least twice in public history. If every balloon is a favourite, the constraint is relaxed. |
| R18 | Hot-seat privacy, autosave/resume, and undo return to a human decision. | `PrivacyCover` + `SupportPanel`; `src/storage.ts`; `onUndo` in `src/App.tsx` | `scripts/e2e.mjs` hot-seat flow; “privacy cover did not pass”; “undo did not return to Player 2” | Undo skips AI replies and lands on the previous human support or round summary. Autosave is per action; the cover reappears on reload. |
| R19 | Family-safe vocabulary; colour + pattern + number. | `src/i18n.ts`; balloon `pattern` in data; SVG patterns in `BalloonIcon` | `tests/data.test.ts` › “keeps family-unsafe game vocabulary out of both dictionaries” | The test bans the specific words in both dictionaries. No external art or card text. |
| R20 | LAN host is authoritative; guests send intents, host applies and sends only each guest's filtered view. | `src/App.tsx` `openLanHost` / `commitMove` / `syncHostViews`; `src/ui/LanScreen.tsx`; `@family-arcade/lan` | `node scripts/e2e.mjs` LAN leg: host authority, `windPlan`/`supports` absent from guest WebSocket views, guest cannot advance | Host validates seat and phase; guest intent cannot include another seat; hidden state is stripped by `view` before sending. |
| R21 | LAN room code, QR, seat status, and guest reconnect. | `LanHost.create` / `onChange` / `sendView`; `LanGuest.join` token; `LanScreen` | LAN E2E: join, seat status, guest reload/rejoin, same seat, host resends view | Guest token lives in localStorage; host keeps the seat on disconnect; host leaving ends the rally. No spectator/AI takeover in v0.1. |
| R22 | LAN relay must be treated as a dumb forwarder; Tauri and browser use the same protocol. | `src/net.ts`; `src-tauri/`; `packages/lan` wire protocol | LAN E2E through `tools/lan-server.mjs`; Tauri shell config retained | Browser relay on 8090 in this app; Tauri shared relay 8080–8087; relay only forwards JSON. |

## Ambiguities and chosen family-friendly readings

1. **Final +5 supporters.** The brief says “supporters of the overall leading balloon”. The engine awards +5 to players whose **round-4 support** is among the overall leaders. This keeps the last round dramatic and avoids double-counting earlier supports.
2. **Tied leaders.** All balloons at the top position count as leaders; all their backers score 3. “Second” is the next **distinct** position, so a 2–2–1 split gives both 2s a second-place point.
3. **All tied.** If all five balloons share the top position, there is no second place. Every player backing any balloon gets the leader 3.
4. **Tailwind frequency.** Two tokens per rally, but since each seat makes one support choice per round, the maximum is one token per round. Tokens can be used in any two rounds.
5. **Stacking.** Multiple players may support and tailwind the same balloon; each tailwind adds +1. This is the party-reading: cheer together.
6. **Track end.** Space 20 is the end. Movement is capped; there is no extra “finish” bonus. The highest position after round 4 is the overall leader.
7. **Live token points.** Unused tailwind points are included in the live total (and in the end total). Spending one trades a guaranteed point for a chance at round/overall points.
8. **Final tie.** If total, correct supports, and tokens left are all equal, the win is shared; no arbitrary seat order.
9. **Replay scope.** v0.1 replays the current finished rally from its round history. It does not archive the last ten games yet.
10. **6 players.** 2–6 is supported end-to-end. The layout is tuned for 2–4; six is readable but denser. Documented in `docs/limitations.md`.
11. **LAN privacy.** The host still collects supports in seat order, but guests never receive another seat's current support or the wind plan. A guest receives `view(state, guestSeat)` and sends only a support intent; the host ignores an intent for the wrong seat or phase. Reconnect resends that seat's view. This preserves the same secrecy as the hot-seat cover.

## Verification commands

```bash
npm run data:verify
npx tsc --noEmit
npx vitest run
npm run build
node scripts/e2e.mjs   # local + real LAN host/guest
npm run ai:calibrate   # 200 games per matchup
```

`tests/simulation.test.ts` runs 120 seeded complete rallies and checks `invariants` after every action, serialization round-trips, and replay. `tests/ai.test.ts` checks four levels, legality, determinism, budget, and Companion gentleness. The E2E script also runs a real relay session: host authority, every guest WebSocket view stripped of `windPlan` and other `supports`, guest reload/rejoin, and host-only round advance. Calibration results are in `docs/ai-calibration.md`.
