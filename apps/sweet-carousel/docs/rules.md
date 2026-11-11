# Sweet Carousel · Rule audit

> Rule → code → test → edge cases. If a rule has no test, it is not implemented.
> Engine version: save format `1`; card data `1`; AI level set `companion | easy | normal | hard`.

## 1. Contents and setup

| # | Rule | Code | Test | Edge cases |
| --- | --- | --- | --- | --- |
| R1 | The deck has 72 cards: 6 desserts × 12 copies. | `data/cards.json`; `src/game/data.ts` (`CARD_DATA`, `CARD_COUNT`) | `tests/scoring.test.ts` → “has 72 cards, 12 copies of every dessert, and a type for every id” | `npm run data:verify` also checks ids 0..71, copies 1..12, and colour/shape metadata. |
| R2 | 2–5 players; every seat needs a name and a human/AI kind. | `setup()` / `validateConfig()` in `src/game/engine.ts` | `tests/engine.test.ts` → “rejects invalid configurations” | 1 player and 6 players are rejected; blank names are rejected. |
| R3 | Each round deals 8 cards per player from a fresh shuffle of all 72. | `setup()`, `dealAllRounds()` | “deals eight cards per player for every round” | Unused cards are discarded for that round; the next round shuffles again. Every round's dealt cards are unique. |
| R4 | Three rounds; round 1 passes left, round 2 right, round 3 left. | `roundDirection()`, `applyNextRound()` | “passes the remaining hand left in round 1, right in round 2, left in round 3” | Direction is recomputed when the next round starts; it is not editable. |
| R5 | A game ends only after the third round is scored and the player confirms the final screen. | `applyNextRound()`, `result()` | “finishes after exactly three rounds and produces a ranking” | `apply` returns `game-over` after the final `next-round`. |

## 2. Simultaneous choices and the pass

| # | Rule | Code | Test | Edge cases |
| --- | --- | --- | --- | --- |
| R6 | In the `choosing` phase each seat may submit exactly one card from its own hand. | `applyPick()`, `legal()` | “offers one legal pick per card in hand and none after a pick”; “accepts one hidden pick per seat…” | A seat may pick in any order; humans and AI share the same operation. |
| R7 | A second pick, a card from another hand, an unknown seat, or a card already picked is rejected with a stable code. | `applyPick()` | “rejects picks with explainable error codes” | Codes: `already-picked`, `card-not-in-hand`, `bad-seat`, `wrong-phase`, `game-over`. |
| R8 | When every seat has picked, the game enters `reveal` and all picks become public. | `applyPick()` (`allPicked`) | “accepts one hidden pick per seat and reveals only when everyone has picked” | Picks are removed from hands and appended to the round's collected cards at reveal. |
| R9 | After the reveal, `advance` passes each remaining hand one seat in the round's direction, then returns to `choosing`. | `applyAdvance()`, `passedHands()` | “passes the remaining hand left…” | After the 8th pick, `advance` scores the round and enters `round-end`; no empty pass screen. |
| R10 | `advance` is only legal in `reveal`; `next-round` only in `round-end`. | `applyAdvance()`, `applyNextRound()` | “rejects advance before the reveal and next-round before the round ends” | Error code is `wrong-phase` with the current phase in `params`. |
| R11 | `apply` never mutates its input state. | `cloneState()`, every `apply*` helper | “does not mutate the input state” | The returned state is a deep-enough copy for hands, deals, rounds and picks. |
| R12 | Replaying the same seed and the same moves produces the same state and scores. | `setupFromSeed()`, `replay()`, `mulberry32` | “replays a finished game to the same state”; “is deterministic for the same seed…” | AI choices are stored as moves; replay does not re-run AI. |

## 3. Scoring table (exact)

Scoring is per round. A round is the 8 cards a seat has collected that round.

| Combination | Points | Exact rule | Code |
| --- | --- | --- | --- |
| Pair (same dessert ×2) | **2** | One pair per dessert type per round. | `scoreCards()` → `COMBO_POINTS.pair` |
| Triple (same dessert ×3) | **6** | One triple per dessert type per round. | `COMBO_POINTS.triple` |
| Four-of-a-kind (same dessert ×4+) | **12** | One full plate per dessert type per round; copies beyond four are leftovers. | `COMBO_POINTS.quad` |
| Sampler (three different desserts) | **5** | Exactly three different **leftover** dessert types, one card each. Four or more leftover types do not score a sampler. | `scoreCards()` → `sampler` |
| Leftover card | **1 each** | Every card not consumed by a set or sampler. | `LEFTOVER_POINTS` |
| Popularity crown | **6 each** | At game end, for each dessert, the unique player with the most copies, at least **6**, scores 6. A tie awards no crown. | `computeCrowns()`, `CROWN_MIN` |
| Tie-break | — | Total → most crowns → most dessert kinds → earlier seat order. | `result()` |

### Why these interpretations

- **One set per dessert per round.** This prevents an eight-card pile of one dessert from becoming two quads and keeps the target band around 30–45.
- **Sampler must be exactly three leftover types.** It is a small plate, not “three or more”. If you keep four types as leftovers, the sampler does not trigger.
- **Crowns are final-only.** They are a race across all three rounds, not a per-round bonus. A player needs a strict table lead with at least six copies.
- **Unused cards in a round are not in anyone's hand.** The 72-card deck is reshuffled for each round, so the same physical id can appear in a later round; this is expected and the invariants only require uniqueness within the current round.
- **Score totals.** Random legal play averages about **39 points** per seat in 400 simulated games (range 24–65); AI-vs-AI tables average about 43–51. The design target is 30–45 for a typical family game.

## 4. Privacy and views

| # | Rule | Code | Test | Edge cases |
| --- | --- | --- | --- | --- |
| R13 | `view(state, seat)` exposes only that seat's hand. | `view()` in `src/game/engine.ts` | `tests/engine.test.ts` → “exposes only the requesting seat hand and hides future deals” | Future `deals`, other hands and other pending cards are not present as arrays. |
| R14 | Before the reveal, another seat's pending pick is not visible; only “has picked” is public. | `view()` → `myPending`, `PublicSeatView.hasPicked` | “hides a pending pick from other seats until the reveal” | The picker sees their own pending card; everyone else sees only the boolean. |
| R15 | At reveal, all picked cards are public. | `view()` → `revealed`, `roundPicks` | “shows revealed picks to everyone and no hand after the reveal” | `myHand` is empty outside `choosing`. |
| R16 | The hot-seat UI must not render another player's hand. The cover replaces the whole game surface. | `src/ui/GameScreen.tsx` (`covered`, `uncoveredKey`) | `scripts/e2e.mjs` asserts no `.hand-fan` while the cover is visible, and after the first pick. | The `uncoveredKey` includes round + pick + seat, so a pick changes the key in the same render and cannot leave the next hand visible for a frame. |
| R17 | Spectators (`seat = null`) never receive a hand. | `view(state, null)` | “shows revealed picks…” → `view(state, null).myHand` is empty | No spectator mode is shipped in v0.1; the view supports it for the next milestone. |

## 5. Memory, resume and invariants

| # | Rule | Code | Test | Edge cases |
| --- | --- | --- | --- | --- |
| R18 | Autosave after every applied move; resume from the last legal state. | `src/storage.ts` (`saveCurrentGame`, `loadSavedGame`) | `scripts/e2e.mjs` reloads after pick 1 and resumes at pick 2. | Ended games clear the save. Corrupt saves are removed and the home screen offers no continue card. |
| R19 | Serialized saves have a version and reject unknown versions without crashing. | `serialize()`, `deserialize()` | “round-trips every phase…”; “rejects corrupted and unsupported saves” | Version 1 only; unknown version produces a readable error. |
| R20 | Every state has invariants: card range, hand sizes, collected counts, phase/pending consistency, current-round deal equality, non-negative scores. | `invariants()` | “keeps every invariant after each step of a full game”; 120-game simulation | Invariants are checked after every simulated step. |
| R21 | 100+ seeded random games terminate with a ranking. | `tests/simulation.test.ts` | “120 seeded random games …” | 2–5 players, random legal picks, max 500 steps per game. |

## 6. AI

| # | Rule | Code | Test | Edge cases |
| --- | --- | --- | --- | --- |
| R22 | Four levels: Companion / Easy / Normal / Hard. | `src/ai/ai.ts`, `src/ai/worker.ts` | `tests/ai.test.ts` → “always returns a card in the current hand” | All levels receive only a `GameView`, never engine state. |
| R23 | AI decisions are deterministic for the same view, level and injected RNG. | `choosePick(view, level, budget, rng)` | “is deterministic for the same view, level and RNG seed” | The worker seeds from the request; tests pass a fixed seed. |
| R24 | Every level returns a legal card or `null` when no pick is possible. | `choosePick()`, `legal()` fallback in App | “returns null when there is nothing legal…”; “finishes well inside the 80 ms budget” | Hard samples opponent hands for a short rollout; Normal uses a 4-sample rollout; Easy/Companion use the heuristic. |
| R25 | Companion does not take a human opponent's last needed card when an alternative exists. | `avoidForCompanion` in `evaluateCandidate()` | “does not take a human opponent's last needed card when another card is available”; “still takes the strong card when there is no alternative” | “Last needed” means the human has 2 or 3 of that dessert in the current round and the candidate is the last copy of it in the AI's hand. |
| R26 | Hints use the same AI and attach a reason. | `onHint()` in `src/App.tsx`, `explainPick()` | “names the combo that the suggested card would complete”; “explains a pair, a sampler and a denial” | Hint highlights the card but never plays it. |

## 7. Data and content

| # | Rule | Code | Test | Edge cases |
| --- | --- | --- | --- | --- |
| R27 | Card data is a versioned JSON file with source and count. | `data/cards.json` | `npm run data:verify` | Version must be 1; source is a sentence; count must be 72. |
| R28 | Names, shapes, colours and card text are original. | `src/ui/components.tsx` (`SHAPE_PATHS`), `data/cards.json` | visual review; `NOTICE.md` | No third-party art, card text, publisher name or logo. |
| R29 | Chinese and English UI dictionaries are complete mirrors. | `src/i18n.ts` | TypeScript `Record<keyof typeof zh, string>` for `en`; `scripts/check-i18n.mjs` (dev aid) | Dynamic keys are covered: desserts, errors, hints, rounds, AI descriptions. |

## 8. UI and accessibility

| # | Rule | Code | Test | Edge cases |
| --- | --- | --- | --- | --- |
| R30 | Two-step pick: select a card, then confirm; cancel is always available before confirm. | `src/ui/GameScreen.tsx` (`selected`, `confirm`, `cancel`) | `scripts/e2e.mjs` selects and confirms; `game-select.png` | Clicking a selected card again clears it. |
| R31 | Keyboard path: ←/→ select, Enter on the focused card or confirm button, Esc clears, U undo, H hint. | `GameScreen.tsx` keydown handler | manual + e2e card selection | Global Enter is ignored when a button has focus to avoid double activation. |
| R32 | Hands are covered between hot-seat players; the cover has a named “I am…” button and no hand DOM. | `covered`, `uncoveredKey`, `privacy-cover` | e2e privacy assertions in both desktop and mobile | Solo (one human) skips the cover; AI seats never get one. |
| R33 | `prefers-reduced-motion` and the settings switch disable non-essential animation. | `storage.ts` default; `styles.css` `[data-motion='reduced']` | e2e toggles the switch and checks `data-motion` | Motion is only decorative; results remain visible. |
| R34 | Colour is never the only channel: every card has a shape and a written dessert name; seats have dot/plus/ring/slash/star marks. | `SHAPE_PATHS`, `DessertIcon`, `SeatDot` | visual review; screenshots | Works in grayscale as shape + label. |
| R35 | Sound can be turned off; the game is fully playable muted. | `src/sound.ts`, settings three levels | manual; default is off | Sound is synthesised, no external audio files. |

## 9. LAN

| # | Rule | Code | Test | Edge cases |
| --- | --- | --- | --- | --- |
| R36 | LAN is host-authoritative: guests send only pick intents; the host validates with `apply` and broadcasts new filtered views. | `src/App.tsx` (`createLanRoom`, `host.onIntent`), `@family-arcade/lan` | `scripts/e2e.mjs` LAN block | A guest cannot send state, a card from another hand, or an advance; invalid intents are dropped. |
| R37 | Each guest receives only `view(state, guestSeat)`, never full hands or another pending pick. | `src/App.tsx` (`sendLanViews`), `src/game/engine.ts` (`view`) | LAN E2E compares host/guest hand ids and asserts no overlap; view privacy tests | The host local UI reads the full state; only the host. |
| R38 | The host starts only when every configured seat is connected. | `LanHostLobby` `ready`, `startLanGame` | LAN E2E joins a 2-seat room and starts | Open seats show as “open”; start disabled. |
| R39 | A disconnected guest keeps the seat token and can rejoin; the host resends start + its filtered view. | `@family-arcade/lan` token mapping, `host.onChange` resend | LAN E2E closes the guest page and rejoins at pick 2 | Same browser profile token; a new profile gets a new seat. |
| R40 | The LAN lobby exposes room code, QR invite and seat status; the invite carries room + code. | `LanHostLobby`, `net.ts` (`inviteUrl`) | LAN screenshots; LAN E2E reads invite and joins at relay port | If 8080 is busy, `?lanPort=8095` selects a custom relay. Invite uses the current hostname. |
| R41 | LAN does not record guest stats; the host records the final table result locally. | `commitLanHost` (`recordStats` on end) | manual LAN game; stats screen | Guests show ranking but do not write local stats. |
| R42 | LAN v1 has no spectator or AI takeover; a disconnected seat waits for reconnect. | `docs/limitations.md` | LAN E2E does not test spectator | Documented gap, not a hidden feature. |

## 10. Known gaps (see `docs/limitations.md`)

- LAN works host/guest; spectator mode, UDP discovery and AI takeover are **not** in v0.1.
- The Tauri shell is present; the NSIS installer is built centrally, not in this pass.
- Undo history is session-only; reload keeps the current state but not the undo stack.
- “Review” shows stored round records and picks; it does not re-apply every move through the engine.
- 5-player hot-seat privacy relies on the cover screen and honest physical passing; it cannot protect against someone looking at the screen while another player is uncovered.
