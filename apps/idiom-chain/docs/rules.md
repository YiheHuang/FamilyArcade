# Idiom Chain · rule audit

Every rule below has a pure-engine implementation, a test, and an edge case. The
engine lives in `src/game/idiom-chain.ts`; the bundled dictionary lives in
`src/game/dictionary.ts`. Neither file reads the DOM, network, clock or
`Math.random`. The UI owns the timer and calls the engine's pure `timeout()`
action.

## Dictionary

| Item | Implementation | Verification |
| --- | --- | --- |
| At least 500 idioms | 680 hand-selected entries in `src/game/dictionary.ts` | `dictionary.test.ts` “bundles at least 500…” |
| Pinyin | One space-separated syllable per character; tone marks retained | “has one pinyin syllable per Chinese character” |
| Short English gloss | One written-for-this-project English gloss per idiom | “has a short gloss…” |
| Frequency labels | 1–5 family-familiarity rating; 1 is uncommon, 5 is everyday | “marks a meaningful rare subset” (274 rare entries) |
| Rare scoring | `isRare()` is true at frequency ≤ 2 | score tests and `scoreFor()` |
| Originality | Idiom phrases are traditional public-domain language; the selection, pinyin, glosses, labels and code are original | `NOTICE.md` |

The dictionary is intentionally a shared table dictionary: a real idiom that is
not in the 680-entry list is rejected. This keeps AI, hints, LAN validation and
hot-seat play on the same rule set. The list uses simplified characters.

## Turn rules

| # | Rule | Code | Test |
| --- | --- | --- | --- |
| R1 | Two to six players. | `setup()` throws outside 2–6 | “accepts two to six players…” |
| R2 | The first player opens with any bundled idiom. | `startMatches(idiom, null, …)` is true | “lets the first player open…” |
| R3 | Every later idiom starts with the final character of the previous idiom. | `startMatches()` / `playIdiom()` | “requires the next idiom…” |
| R4 | Homophone mode is optional. It matches the final syllable, ignoring tone, instead of the character. | `startMatches()` with `homophone` | “accepts a homophone…” |
| R5 | No idiom may be used twice in the same chain. | `usedTexts()` check in `playIdiom()` | “rejects a repeated idiom…” |
| R6 | Unknown, blank, wrong-start, repeated, passed or late attempts lose the turn. | `failTurn()` / `playIdiom()` / `passTurn()` / `timeout()` | “loses the turn…”, “on a late play”, “on a pass” |
| R7 | A valid idiom scores 1 point. | `scoreFor()` | “lets the first player open…” |
| R8 | A rare idiom adds 2 points. | `scoreFor()` (+2 at frequency ≤2) | “adds the rare bonus” |
| R9 | Every third consecutive hint-free idiom adds 1 point. The run resets after the bonus and after a hint or failure. | `scoreFor()` and `PlayerState.streak` | “awards +1 on every third…”, “resets the hint-free run…” |
| R10 | The first player to 10 points wins immediately. | `finish(..., 'score')` in `playIdiom()` | “ends immediately at the winning score” |
| R11 | Three strikes (configurable 2/3/5 in the UI) eliminate a player. The last player standing wins. | `failTurn()`, `finish(..., 'last-standing')` | “eliminates a player…”, “honours a custom strike limit” |
| R12 | Eliminated players are skipped in the turn order. | `nextActive()` | “skips eliminated seats…” |
| R13 | A lan seat may only play on its own turn. | `playForSeat()` | “re-checks the seat for LAN intents” |
| R14 | Each device gets its own view with `canPlay`; the chain itself is public. | `view(state, seat)` | “gives each seat a public view…” |

### House choices (explicit)

These are the family-table choices the source contract leaves open. They are
shown in the UI and documented here rather than hidden in code.

- **Opening seat.** The UI always gives the first turn to seat 0 (the human,
  the host, or the first hot-seat player). The engine accepts any `first` seat
  and picks one from the injected RNG when `first` is omitted; tests and demos
  use that deterministic path.
- **Strikes.** Invalid, blank, passed and late attempts each add one strike.
  Three strikes is the default; 2 and 5 are offered in the table set-up. A
  player leaves the rotation on their final strike. The last active player wins
  immediately, even below 10 points.
- **No-hint bonus cadence.** The bonus is awarded on the third consecutive
  hint-free valid idiom, then the run restarts. So plays 3, 6, 9, … in one
  unbroken run each carry +1. Using a hint, failing a turn, or losing the turn
  resets the run to zero.
- **Dead end.** If the dictionary has no unused continuation, each player must
  pass or time out. Those attempts are ordinary strikes, so a dead-end chain
  closes through the last-standing rule. There is no silent auto-restart.
- **Hot-seat cover.** The cover is a handoff curtain so the next player starts
  cleanly; idiom chain has no hidden cards or secret hands. The timer pauses
  while the cover is up.
- **Undo in hot-seat.** Undo is only available after the incoming player reveals
  the table. Restoring an earlier state puts the cover back on that player's
  turn.
- **LAN undo.** Undo is disabled in LAN play so a device cannot rewind another
  seat's public turn and gain time or information.
- **Dictionary boundary.** Only the bundled dictionary is accepted, even if a
  player knows a perfectly good idiom outside it. This is the shared family
  dictionary and is stated on the rules screen.

## Scoring examples

| Play | Rare? | No-hint run after play | Points |
| --- | --- | --- | --- |
| 一心一意 | no | 1 | 1 |
| 暗箭伤人 | yes | 1 | 3 |
| second rare in a run | yes | 2 | 3 |
| third rare in a run | yes | 0, bonus paid | 4 |
| third rare after using a hint | yes | 1, no bonus | 3 |

The engine stores both the total points on each `ChainEntry` and the current
`streak` on each player, so the UI can explain the bonus without recounting.

## Hint contract

`hintFor(state, seat)` is pure and returns `null` when it is not that seat's
turn, the player is out, or no unused dictionary continuation exists. Otherwise
it ranks legal candidates by:

1. number of unused continuations after the candidate;
2. family frequency;
3. idiom length;
4. a stable text tie-break.

The returned `reason` is one of `only`, `opens`, `rare` or `common`, and
`nextCount` is the number of known unused continuations. The UI localises the
reason and the hint card shows the pinyin and gloss. Clicking Hint does not
change the engine state; the next valid play is submitted with `usedHint`, which
resets that player's no-hint run before scoring. In LAN play the hint is
computed on the guest device and the `usedHint` flag travels with the play
intent; the host validates the play and applies the same scoring rule.

## AI contract

`chooseIdiom(state, level, rng)` searches `chainableIdioms(state)` — the same
dictionary index by first character/sound used by the engine.

| Level | Behaviour | Determinism |
| --- | --- | --- |
| Companion | Prefers common, short idioms with comfortable continuations; avoids rare words; never selects a dead end when a live option exists | Same state + injected RNG → same idiom |
| Easy | Often picks a familiar first idea; sometimes chooses at random from live options | same |
| Normal | Balances points, frequency and keeping the chain open | same |
| Hard | Values rare points, looks one reply ahead and heavily penalises dead ends | same |

No level has access to a private hand, because there is none. The strict
“dictionary search by first character” requirement is implemented in
`chainableIdioms()` and `chainCandidates()`; the four levels differ only in how
they score the returned candidates, using frequency and length.

## LAN contract

The host owns the authoritative `GameState`. The shared relay is a message bus.
Each guest receives only `view(state, seat)` and can send only:

```ts
{ type: 'play', text: string, usedHint: boolean }
{ type: 'pass' }
```

The host checks `humanSeats`, `playForSeat()`, the turn, the dictionary, the
start character/sound and the used list before applying anything. A stale or
spoofed intent is ignored and the host re-sends the current view. On each
commit the host sends a fresh view to every connected human guest. The room code
is a family convenience, not a security boundary.

The host's timer is authoritative for all human seats. A guest countdown is a
visual forecast of the host timer. A disconnected guest keeps their seat; the
host timer will record a strike and eventually eliminate them. Empty LAN seats
can be filled with AI at the selected level. Late arrivals cannot take over a
seat after the deal.

## Test map

- `tests/dictionary.test.ts` — 10 tests: size, uniqueness, pinyin/character
  alignment, gloss/frequency, rare subset, first-character search, homophone
  sounds, continuation search, normalisation, demo vocabulary.
- `tests/game.test.ts` — 34 tests: set-up and defaults, player bounds, RNG first
  seat, names/config, opening, rare bonus, start-character enforcement,
  repeats, invalid/blank/out-of-turn, three-play bonus, hint reset, score win,
  turn loss, timeout, pass, elimination, custom strike limit, skipped seats,
  homophone mode, LAN seat check, per-seat view, JSON round-trip, reasoned hint,
  dead end, required character, direct score arithmetic, four AI levels, AI
  legality, determinism, Companion gentleness, homophone AI, no-move pass, and
  a complete AI-vs-AI game.
- Browser `scripts/e2e.mjs` — 54 checks across solo, AI replies, reasoned hint,
  undo, autosave/resume, hot-seat cover, the real 10-second timer, a complete
  game, family record, Chinese UI, keyboard path and mobile.
- LAN `scripts/lan-e2e.mjs` — 22 checks: room creation, two guests, per-seat
  views, host and guest turns, host-validated hint plays, and chain broadcast.
