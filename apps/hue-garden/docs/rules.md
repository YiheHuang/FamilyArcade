# 彩庭 · 规则审计 / Hue Garden rules audit

> 每个规则一行：规则 → 代码 → 测试 → 边界。没有测试的规则视为没有实现。
> 规则解释以家庭友好为准；有歧义的地方写成“家庭房规”，并在 UI 与 README 中同步。

## 1. 核心规则

| # | 规则（中 / EN） | 代码 | 测试 | 边界情况 |
| --- | --- | --- | --- | --- |
| R1 | 108 张瓷砖 = 6 色 × 6 形 × 3 张；每色 18、每形 18。/ 108 tiles = 6 colours × 6 shapes × 3 copies. | `data/tiles.json`, `src/game/tiles.ts` (`TILE_SPECS`, `fullBag`) | `tests/data.test.ts` — “has 108 physical tiles…”, “is balanced across colours and shapes” | 组合数 36；任何重复/缺失由 `npm run data:verify` 拦截。 |
| R2 | 每人起手 6 张；2–4 人。/ Hand of 6; 2–4 players. | `src/game/engine.ts` `setup`, `HAND_SIZE` | `tests/rules.test.ts` — “deals six tiles per seat…”; “rejects malformed configurations” | 2/3/4 人；座位名不能为空；AI 档位必须是四档之一。 |
| R3 | 一回合铺 1–3 张；不能 0 张或 4 张。/ Lay 1–3 tiles. | `validatePlay`, `MAX_PLAY_TILES` | `tests/rules.test.ts` — “allows an opening line of up to three tiles”; “rejects stale and malformed moves…” | 4 张 → `too-many-tiles`；空走法 → `no-tiles`。 |
| R4 | 一条线只能同色不同形，或同形不同色。/ A line is one colour with different shapes, or one shape in different colours. | `src/game/board.ts` `lineError`; `validatePlay` | `tests/rules.test.ts` — “accepts same colour…”, “accepts same shape…”, “rejects a mixed line” | 横线与竖线都检查；`line-mixed`。 |
| R5 | 一条线不能重复同一张瓷砖。/ No duplicate tile in a line. | `lineError` (`combos.size < length`) | `tests/rules.test.ts` — “rejects a duplicate colour/shape combination” | `line-duplicate`；同色线里重复形状、同形线里重复颜色都归到这里。 |
| R6 | 一条线最多 6 张。/ At most six tiles in a line. | `lineError` (`length > 6`) | `tests/rules.test.ts` — “rejects a seventh tile in a line” | `line-too-long`；即使第 7 张是合法组合也拒绝。 |
| R7 | 新铺的砖必须在同一条线上，并且彼此连续（中间不能空）。/ New tiles share one line and are contiguous. | `playAxis`, `validatePlay` 的排序/相邻检查 | `tests/rules.test.ts` — “rejects diagonal and gapped placements” | 斜线 → `not-in-line`；中间缺一格 → `not-contiguous`。 |
| R8 | 除第一手外，新砖必须接在庭院边上。/ New tiles must touch the courtyard. | `hasAdjacentExisting`; `validatePlay` | `tests/rules.test.ts` — “requires a new play to touch the courtyard” | `not-connected`。横/竖相邻都算。 |
| R9 | 第一块砖必须放在庭院中心 `(0,0)`（家庭房规）。/ The opening covers `(0,0)` (house rule). | `OPENING`, `validatePlay` | `tests/rules.test.ts` — “opens on the courtyard origin” | 第一手 1–3 张都必须覆盖中心；否则 `opening-origin`。 |
| R10 | 只能接在线两端，不能插进两条现有线之间（家庭房规）。/ Add to ends only; never insert. | `validatePlay` 的 `cannot-insert` 检查；`candidateSegments` 的 `inserted` 预筛 | `tests/rules.test.ts` — “rejects inserting a tile between two existing tiles” | 单张也不可插；垂直方向的插入同样拒绝。 |
| R11 | 每张砖的横线和竖线都要合法；一张砖可以同时接横竖两条线。/ Every affected line must be legal. | `touchedLines`, `lineError` | `tests/rules.test.ts` — “checks the perpendicular line too” | `line-mixed`；横竖线都做最大值/重复检查。 |
| R12 | 计分：每条线每张 1 分；一条 6 张线再 +6（开花）。/ 1 point per tile; a six-line +6. | `scoreLines`, `BLOOM_BONUS` | `tests/scoring.test.ts` — “scores one point per tile…”, “scores a six-tile bloom…” | 一张砖同时接横竖：两条都计（“scores the row and the perpendicular line”）；同一线由多张新砖接上只计一次（“does not double-count…”）。 |
| R13 | 第一手单张算 1 分；第一手多张按整条线计。/ Opening singleton scores 1. | `scoreLines` 的 `points === 0` 分支 | `tests/scoring.test.ts` — “scores an opening single tile as one”; “scores a new line of three once” | 单张不会是 0 分；多张不会重复计。 |
| R14 | 铺完后补到 6 张（牌袋够的话）。/ Draw back to six. | `drawToHand` | `tests/rules.test.ts` — “deals six…”；`tests/engine.test.ts` invariant test | 牌袋不足时手牌可以小于 6；不补假牌。 |
| R15 | 可以换 1–3 张牌；牌袋必须够换。 | `validateSwap`; `apply` 的 swap 分支 | `tests/rules.test.ts` — “swaps one to three…”, “rejects a swap when the bag is too small…” | 重复索引 → `hand-index`；超过 3 张 → `swap-size`；袋不够 → `bag-too-small`。 |
| R16 | 只有在没有可铺线且牌袋为空时才可跳过。/ Pass only when no line and no bag. | `validatePass`; `legalMoves` | `tests/rules.test.ts` — “allows pass only when nothing can be played or swapped” | 有牌可换时 `pass-not-allowed`。 |
| R17 | 牌袋空后打空手牌：+6，本局结束。/ Empty rack after bag empty: +6 and end. | `apply` 的 play 结束分支；`CLEAR_BONUS`; `finish` | `tests/engine.test.ts` — “ends with a +6 bonus…” | 先结算线分 + 打空 +6，再排名；`lastScore.endBonus = 6`。 |
| R18 | 全家都跳过（无牌可铺、无袋可换）→ 本局按分数结束。/ A full pass cycle ends by score. | `apply` 的 pass 分支；`finish('blocked')` | `tests/engine.test.ts` — “ends by mutual block…” | 连续 pass 数达到人数；共享第一也合法。 |
| R19 | 硬回合上限 500；到上限按分数结算。/ Hard cap 500 turns. | `MAX_TURNS`, `maybeCap` | `tests/engine.test.ts` — “has a hard turn cap…” | `endReason='cap'`；不会无限循环。 |
| R20 | 平局：先六连数量，再手牌剩余；仍相同则并列第一。/ Tie-break: blooms, then fewest tiles left, else shared. | `rankRows`, `computeWinners`, `result` | `tests/engine.test.ts` — “breaks ties by blooms, then by fewest tiles left, then shares the win” | 三人同分；`result.winner === null` 但 `winners` 有两人；名次并列。 |
| R21 | 隐藏信息在 `view` 裁剪：只给本人的手牌；别人的手牌和牌袋内容不出现。/ Hidden information is cropped in `view`. | `view` | `tests/ai.test.ts` — “only receives the acting seat hand and public counts” | `hand: null` 给观战者；`handCounts`、`bagCount` 可见；无 `hands`/`bag` 数组。 |
| R22 | 种子 + 走法 = 同状态；序列化带版本；复盘重新应用走法。/ Seeded determinism and versioned saves. | `rng.ts`, `rngForConfig`, `replay`, `serialize`, `deserialize` | `tests/rules.test.ts` — “is deterministic for the same seed”; `tests/engine.test.ts` — “round-trips…”, “replays the same moves…” | 旧版本 → `save-version`；损坏 → `save-corrupt`；回放非法走法会抛错。 |
| R23 | 每步不变量：108 张守恒、线合法、棋盘连通、分数非负、当前座位合法。/ Invariants after every move. | `invariants` | `tests/simulation.test.ts` — 120 random games, every step; `tests/engine.test.ts` — “keeps invariants clean after every move” | 重复坐标、未知 tile、断开的庭院、负数分都会被报出。 |

## 2. AI 规则

| # | 规则 | 代码 | 测试 | 边界 |
| --- | --- | --- | --- | --- |
| A1 | 四档：陪玩 / 轻松 / 标准 / 挑战。 | `src/game/types.ts` `AI_LEVELS`; `src/ai/ai.ts` `AI_WEIGHTS` | `tests/ai.test.ts` — “returns a legal move for all four levels…” | 名称与 UI `ai.*` 一致。 |
| A2 | AI 只收到 `view`；不读其他手牌/牌袋内容。 | `src/ai/ai.ts` `positionFromView`; `src/ai/worker.ts` | `tests/ai.test.ts` — “only receives the acting seat hand…” | 用假牌袋长度保留换牌合法性；不模拟对手手牌。 |
| A3 | 陪玩档不故意堵人：对手权重与威胁权重为 0。 | `AI_WEIGHTS.companion` | `tests/ai.test.ts` — “gives the companion no denial or threat weight” | 仍有高噪声与前 5 名随机池。 |
| A4 | 时间预算：陪玩/轻松 ≤80ms，标准 ≤300ms，挑战 ≤900ms。 | `chooseMove` deadline; `src/ai/client.ts` | `tests/ai.test.ts` — “stays within the time budgets” | Worker 超时也会返回当前最优；客户端有同步 fallback。 |
| A5 | 任何合法局面都有合法走法或明确跳过。 | `legalMoves`; `chooseMove` | `tests/ai.test.ts` — “plays two full AI games…”; simulation tests | 无 play 时优先 swap；袋空且无 play 时 pass。 |
| A6 | 同种子 + 同视图 → 同一步。 | `mulberry32` tie-break; `chooseMove` | `tests/ai.test.ts` — “deterministic with a seed” | 时间截断可能影响超大局面；测试用充足预算。 |
| A7 | 提示同源，且给出人话理由。 | `explainMove`, `src/ai/client.ts` `explain` | `tests/ai.test.ts` — “explains a hint in human terms” | 理由 key 形如 `hint.play`/`hint.bloom`/`hint.swap`/`hint.pass`。 |

## 3. 局域网会话

| # | 规则 | 代码 | 测试 | 边界 |
| --- | --- | --- | --- | --- |
| L1 | 主机权威：客人只发 `Move` 意图；主机校验座位/回合后 `apply`。 | `src/App.tsx` `createLanRoom` → `LanHost.onIntent`; `commitMove` | `scripts/lan-e2e.mjs` — host/guest move exchange | 非法/过期意图不改变状态，主机重新发送视图。 |
| L2 | 每个客人只收到自己的 `view(state, seat)`；看不到别人的手牌或牌袋内容。 | `engine.view`; `LanHost.sendView` | `tests/ai.test.ts` “only receives…” + `scripts/lan-e2e.mjs` | 主人仍保留完整 `GameState`；观战暂无。 |
| L3 | 客人用 `viewPosition` 枚举自己的合法点，绝不在本地应用状态。 | `engine.viewPosition`; `App` `legalOptions` | `scripts/lan-e2e.mjs` guest move | 假牌袋只保留数量，不泄露牌面。 |
| L4 | 房间号 4 位 + 二维码邀请（房间、码、名字、`tutorial=0`）。 | `net.ts` `inviteUrl`; `LanScreen` QR | `scripts/lan-e2e.mjs` invite URL | 错误码 → `lan.wrongCode`；满房 → `lan.full`。 |
| L5 | 断线重连回到原座位：客户端令牌 + host token 映射，主机重发 start/view。 | `@family-arcade/lan` `LanHost`/`LanGuest`; `App` `joinLanGuest` | `scripts/lan-e2e.mjs` reload/reconnect | 主机房间关闭后不能重连。 |
| L6 | 座位在线/离线状态可见；退出后主机看到 0 guest。 | `LanPublicPeer.connected`; `GameScreen` `lan` prop | `scripts/lan-e2e.mjs` close page | 客人游戏内显示座位和重连按钮。 |
| L7 | Tauri 与浏览器共用同一中继协议；Tauri 由 `lan_start` 启动。 | `src-tauri/src/main.rs`; `src/net.ts` | `tsc` + Tauri shell (不跑 cargo) | 浏览器需 `npm run lan`，端口 8097。 |

## 4. 错误码 → UI 文案

所有错误码都是稳定字符串，UI 用 `error.<code>` 翻译。完整列表见 `src/game/types.ts` 的 `ErrorCode`；每个都有 `zh/en` 文案。测试覆盖：
- `tests/rules.test.ts`：`not-your-turn`, `game-over`, `tile-not-in-hand`, `cell-occupied`, `cannot-insert`, `opening-origin`, `line-mixed`, `line-duplicate`, `line-too-long`, `bag-too-small`, `hand-index`, `pass-not-allowed`。
- `tests/engine.test.ts`：`bad-seat`, `no-tiles`, `tile-not-in-hand`, `hand-index`, `save-version`, `save-corrupt`。
- `tests/rules.test.ts`：`not-in-line`, `not-contiguous`, `not-connected`。

## 5. 家庭房规（写进 UI 和 README）

1. 第一块砖必须放在 `(0,0)`，让开放棋盘的镜头从庭院中心开始。
2. 只能接在线两端，不插进两条现有线之间；这样“这条线是谁的”更直观，避免餐桌上争论。
3. 牌袋空了才可跳过；还有牌可换时必须换牌，防止无限“跳过”拖时间。
4. 换牌不重洗牌袋，只把换出的牌放回牌袋底部（下一次最晚抽到），保证复盘可复现。
5. 没有可铺线且牌袋为空时，连续跳过一整轮才结束；家庭局允许并列第一。

## 6. 数据与命令

```bash
npm run data:verify   # 108 / 18 / 18 / 3 检查
npx vitest run        # 规则、AI、120 局随机模拟
node scripts/e2e.mjs  # 真实 Chrome 完整流程
node scripts/lan-e2e.mjs # 主机/客人、视图/意图、重连、离线
npm run lan           # 浏览器中继 :8097
```

数据源：`data/tiles.json`（version 1，source 写明原创设计，count 108）。
