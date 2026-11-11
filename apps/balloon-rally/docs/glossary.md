# Glossary — Balloon Rally / 气球大赛

Terms must match across UI, README, rules, tests, and video.

| Concept | 中文 | English | Code / notes |
| --- | --- | --- | --- |
| The game | 气球大赛 | Balloon Rally | `app.name`; original work |
| Valley course | 山谷赛道 | Valley course | `data/course.json`; 20 spaces |
| Balloon | 气球 | Balloon | `Balloon`; five neutral balloons |
| Support / back | 支持 / 看好 | Support / back | `support` move; never wagering language |
| Tailwind token | 顺风标记 | Tailwind token | `tailwind`; two per player |
| Wind card | 风卡 | Wind card | `wind`; values 1–3 |
| Round leader | 本轮领先 | Round leader | `leaders`; +3 |
| Round second | 本轮第二 | Round second | `seconds`; next distinct position, +1 |
| Overall leader | 总领先 | Overall leader | `overallLeaders`; +5 after round 4 |
| Correct support | 猜中轮数 | Correct round support | Count of supports that hit a round leader; first tie-break |
| Privacy cover | 隐私遮罩 | Privacy cover | `PrivacyCover`; pass-device overlay |
| Hot-seat | 同屏热座 | Hot-seat | 2–6 players, one screen |
| Solo | 单人练习 | Solo with AI | Four AI levels |
| Companion | 陪玩 | Companion | Avoids a human's favourite balloon |
| Easy / Normal / Hard | 轻松 / 标准 / 挑战 | Easy / Normal / Hard | `AI_LEVELS` |
| Family record | 家庭战绩 | Family record | `Stats`; local only |
| Replay | 复盘 | Replay | current finished rally in v0.1 |
| Autosave / Continue | 自动保存 / 继续上局 | Autosave / Continue | `localStorage` per action |
| Unused tailwind | 未用顺风 | Unused tailwind | +1 each at the end |
| Shared win | 并列获胜 | Shared win | All tie-breaks equal |
| Next milestone | 下一里程碑 | Next milestone | LAN spectator/AI takeover, prebuilt installer, human voiceover |
| LAN host / guest | 局域网主机 / 访客 | LAN host / guest | `LanHost` / `LanGuest`; host authoritative |
| Room code / passcode | 房间码 / 口令 | Room code / passcode | Invite `?lan=ROOM&code=CODE` |
| Filtered view | 过滤视图 | Filtered view | `view(state, seat)` before sending to a guest |
| Seat status | 座位状态 | Seat status | connected / waiting in the LAN lobby |
| Reconnect | 重新连接 | Reconnect | guest token + reserved seat |
| Relay | 中继 | Relay | dumb JSON forwarder; Tauri `family-arcade-lan-host` or `tools/lan-server.mjs` |

## Voice rules

- Use **support / back / look good** (支持 / 看好), **tailwind** (顺风), **wind** (风), **round** (轮), **cheer** (掌声). 
- Keep the language playful and family-friendly; talk about support and wind only.
- The fiction is a paper-balloon valley rally, not a racetrack.
- Keep “second” as a position, not a player. The scoring UI says “next distinct position” in rules.
- Use “Companion” (陪玩) for the gentle AI, never “child mode”.
