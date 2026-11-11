# Glossary — Field & Wall / 筑野

One concept, one word, everywhere in the UI, README, rules and video.

| Concept | 中文 | English | Code / data |
| --- | --- | --- | --- |
| Game name | 筑野 | Field & Wall | `field-and-wall`, `FieldAndWall` |
| Tile | 瓷砖 | tile | `TileType`, `PlacedTile` |
| Edge | 边 | edge | `EdgeType`, `edges` (N/E/S/W) |
| Rotation | 方向 / 旋转 | rotation | `Rotation` 0–3, `rotatedEdges` |
| City | 城市 | city | `city`, `FeatureType` |
| Road | 道路 | road | `road` |
| Monastery | 修道院 | monastery | `monastery` |
| Field | 田野 | field | `field` (alignment only in v0.1) |
| Feature | 地物 | feature | `GlobalFeature`, `FeatureType` |
| Complete / close | 合拢 | complete / close | `GlobalFeature.complete` |
| Open edge | 开口 | open edge | `openEdges`, `openDetail` |
| Meeple | 木人 | meeple | `MEEPLES_PER_PLAYER`, `tile.meeple` |
| Majority | 木人最多 | most meeples | `majoritySeats` |
| Tile bag | 瓷砖袋 | tile bag | `state.bag` (hidden order) |
| Hand tile | 手上的瓷砖 | tile in hand | `state.currentTile` |
| Discard | 弃置 | discard | `Move.kind === 'discard'` |
| Final scoring | 终局计分 | final scoring | `endGame`, `featurePoints(false)` |
| Hot-seat | 同屏热座 | hot-seat | `mode: 'hotseat'` |
| Solo | 单人练习 | solo practice | `mode: 'solo'` |
| Companion | 陪玩 | Companion | `AiLevel 'companion'` |
| Easy / Normal / Hard | 轻松 / 标准 / 挑战 | Easy / Normal / Hard | `'easy' / 'normal' / 'hard'` |
| Autosave | 自动保存 | autosave | `saveCurrentGame` |
| Continue | 继续上局 | continue last game | `loadSavedGame` |
| Replay | 复盘 | replay | `ReplayScreen` |
| Shared win | 并列获胜 | shared win | `GameResult.tiedWinners` |

## Style rules

- Chinese titles use the serif stack; body copy uses the sans stack.
- Numbers use tabular figures where they sit in tables; score values are always plain
  integers (no “points” suffix inside the scoreboard).
- “木人” is the player-facing term; the English UI uses “meeple”. Do not mix “米宝” and
  “木人” in the same screen.
- “合拢” is the player-facing verb for a completed feature; code uses `complete`.
- “田野” never scores in v0.1; do not describe it as a farm.
