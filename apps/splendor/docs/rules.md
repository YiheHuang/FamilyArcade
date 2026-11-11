# Splendor · rule audit (family edition)

This is a high-level audit for the imported family edition. Exact implementation and
tests live in `packages/engine/` and `packages/server/`.

| # | Rule | Code | Check |
| --- | --- | --- | --- |
| R1 | 2–4 players; each starts with 0 points and 0 bonuses. | `packages/engine` setup | engine tests |
| R2 | A turn takes 3 different gems, 2 of one colour, or reserves/buys one card. | engine actions | engine tests |
| R3 | Gem pool is limited to 7 per colour (5 for 2 players); gold is wild. | engine state | engine tests |
| R4 | A card costs its printed gems minus owned bonuses. | `canAfford` / `buy` | engine tests |
| R5 | Buying a card adds its bonus and points; bought cards are never lost. | engine buy | engine tests |
| R6 | Reserving takes a card (or the top of the deck) and grants one gold. | engine reserve | engine tests |
| R7 | A player may hold at most 3 reserved cards and 10 tokens. | engine limits | engine tests |
| R8 | Nobles are claimed automatically at 15 points and the required bonuses. | noble check | engine tests |
| R9 | The round finishes; highest score wins. Ties: fewer cards, then shared. | result | engine tests |
| R10 | Four AI personalities; Hard searches and does not read hidden information. | `packages/engine/ai` | AI tests |
| R11 | LAN is host-authoritative; guests receive only their own view. | `packages/server/rooms.ts` | server/LAN tests |
| R12 | Reconnect, undo vote and AI takeover are supported in LAN rooms. | `packages/server` | server tests |

Known gaps (no campaigns, no cloud, no spectator beyond the existing room model) are in
[`limitations.md`](limitations.md).
