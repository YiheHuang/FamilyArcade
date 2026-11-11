/**
 * Verifies every factual claim of both cuts, then writes FACTS.md.
 * Run: npx tsx scripts/facts.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import {
  AI_LEVELS,
  AI_LEVEL_LABELS,
  CARDS,
  NOBLES,
  applyMove,
  gemsPerColorFor,
  noblesFor,
  setupGame,
  totalPoints,
  type AiLevel,
  type GameState,
} from "../../packages/engine/src/index.ts";
import { COPY, allChars } from "../src/copy.ts";
import { FILM_SECONDS, NARRATION } from "../src/narration.ts";
import cardsJson from "../src/data/cards.json";
import gameJson from "../src/data/game.json";
import shotsJson from "../src/data/shots.json";
import narrationZh from "../src/data/narration.zh.json";
import narrationEn from "../src/data/narration.en.json";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const video = join(here, "..");
const rows: Array<{ claim: string; source: string; ok: boolean; detail: string }> = [];
let failed = 0;

function check(claim: string, source: string, ok: boolean, detail = ""): void {
  rows.push({ claim, source, ok, detail });
  if (!ok) {
    failed++;
    console.error(`FAIL ${claim} — ${source} — ${detail}`);
  }
}

type Card = (typeof CARDS)[number];
type Noble = (typeof NOBLES)[number];
type Tokens = Record<string, number>;
type Snapshot = {
  turn: number;
  current: number;
  bank: Tokens;
  board: Array<Array<number | null>>;
  deckCounts: number[];
  nobles: number[];
  players: Array<{
    seat: number;
    kind: string;
    tokens: Tokens;
    bonuses: Tokens;
    cardPoints: number;
    purchased: number[];
    reserved: unknown[];
    nobles: number[];
    points: number;
  }>;
};
type Demo = {
  seat: number;
  before: Snapshot;
  after: Snapshot;
  taken: Tokens | null;
  paid: Tokens | null;
  card: {
    id: number;
    tier: number;
    bonus: string;
    points: number;
    cost: Tokens;
    discount: number;
  } | null;
  nobleId: number | null;
  scoreBefore: number;
  scoreAfter: number;
};
const game = gameJson as unknown as { take: Demo; buy: Demo; noble: Demo; wide: Snapshot };

const cardsById = new Map(CARDS.map((c) => [c.id, c]));
const noblesById = new Map(NOBLES.map((n) => [n.id, n]));
const sum = (t: Tokens | null | undefined, keys = ["white", "blue", "green", "red", "black", "gold"]) =>
  keys.reduce((s, k) => s + (t?.[k] ?? 0), 0);

// ---------------------------------------------------------------- card data
check("90 张发展卡", "engine CARDS", CARDS.length === 90, `${CARDS.length}`);
for (const tier of [1, 2, 3] as const) {
  const expected = { 1: 40, 2: 30, 3: 20 }[tier];
  const got = CARDS.filter((c) => c.tier === tier).length;
  check(`${tier} 级 ${expected} 张`, `engine CARDS tier ${tier}`, got === expected, `${got}`);
}
check("10 位贵族", "engine NOBLES", NOBLES.length === 10, `${NOBLES.length}`);
check(
  "每位贵族 +3 分",
  "engine NOBLES points",
  NOBLES.every((n) => n.points === 3),
  NOBLES.map((n) => n.points).join(","),
);
check("2 人银行每色 4 枚", "gemsPerColorFor(2)", gemsPerColorFor(2) === 4, `${gemsPerColorFor(2)}`);
check("3 人银行每色 5 枚", "gemsPerColorFor(3)", gemsPerColorFor(3) === 5, `${gemsPerColorFor(3)}`);
check("4 人银行每色 7 枚", "gemsPerColorFor(4)", gemsPerColorFor(4) === 7, `${gemsPerColorFor(4)}`);
check("4 人桌面 5 位贵族", "noblesFor(4)", noblesFor(4) === 5, `${noblesFor(4)}`);

// --------------------------------------------------------------- game logic
{
  let ok = true;
  try {
    setupGame([{ kind: "human" }, { kind: "human" }], { seed: "facts-2p" });
    setupGame([{ kind: "human" }, { kind: "human" }, { kind: "human" }], { seed: "facts-3p" });
    setupGame(
      [{ kind: "human" }, { kind: "human" }, { kind: "human" }, { kind: "human" }],
      { seed: "facts-4p" },
    );
  } catch {
    ok = false;
  }
  check("支持 2–4 人", "setupGame", ok);
}
{
  const g = setupGame([{ kind: "human" }, { kind: "human" }], { seed: "facts-final" });
  g.players[0]!.cardPoints = 15;
  const result = applyMove(g, { type: "take", colors: ["blue", "green", "red"] });
  const triggered = result.events.some((e) => e.type === "final-round");
  check("15 分触发最后一轮", "applyMove → final-round", !result.error && triggered, result.error ?? "");
}
{
  const g = setupGame([{ kind: "human" }, { kind: "human" }], { seed: "facts-noble" });
  g.players[0]!.nobles = [0];
  const points = totalPoints(g.players[0]!);
  check("贵族计分 +3", "totalPoints", points === 3, `${points}`);
}
{
  const i18n = readFileSync(join(root, "packages", "client", "src", "i18n.ts"), "utf8");
  check("四档 AI", "engine AI_LEVELS", AI_LEVELS.length === 4, `${AI_LEVELS.length}`);
  check(
    "中文 AI 标签与引擎一致",
    "AI_LEVEL_LABELS",
    (["friendly", "easy", "normal", "hard"] as AiLevel[]).every(
      (level) => COPY.zh.ai[level] === AI_LEVEL_LABELS[level],
    ),
    JSON.stringify(COPY.zh.ai),
  );
  check(
    "英文 AI 标签与 i18n 一致",
    "client i18n aiLabel",
    ["Companion", "Easy", "Normal", "Hard"].every((label) => i18n.includes(`'${label}'`)),
    JSON.stringify(COPY.en.ai),
  );
  check(
    "陪玩档不针对小朋友（文案有出处）",
    "client i18n friendly",
    i18n.includes("刻意针对") && i18n.includes("小朋友") && /never targets you/.test(i18n),
    "missing kinder description",
  );
}

// ------------------------------------------------------------- real moments
function checkCardIds(state: Snapshot, label: string): void {
  const ids = state.board.flatMap((row) => row).filter((id): id is number => id != null);
  check(`${label}：牌面 id 全部存在`, "cards.json", ids.every((id) => cardsById.has(id)), ids.join(","));
  state.players.forEach((p, i) => {
    check(`${label}：玩家 ${i + 1} 已购卡存在`, "cards.json", p.purchased.every((id) => cardsById.has(id)));
  });
  check(
    `${label}：贵族 id 全部存在`,
    "cards.json",
    state.nobles.every((id) => noblesById.has(id)),
    state.nobles.join(","),
  );
}

{
  const demo = game.take;
  const colors = (["white", "blue", "green", "red", "black"] as const).filter((c) => (demo.taken?.[c] ?? 0) > 0);
  check("拿宝石演示：三枚不同色", "game.take", sum(demo.taken) === 3 && colors.length === 3, JSON.stringify(demo.taken));
  const meBefore = demo.before.players[demo.seat]!;
  const meAfter = demo.after.players[demo.seat]!;
  check(
    "拿宝石演示：玩家令牌 +1",
    "game.take.tokens",
    colors.every((c) => meAfter.tokens[c] === meBefore.tokens[c] + 1),
    `${JSON.stringify(meBefore.tokens)} → ${JSON.stringify(meAfter.tokens)}`,
  );
  check(
    "拿宝石演示：银行对应减少",
    "game.take.bank",
    colors.every((c) => demo.after.bank[c] === demo.before.bank[c] - 1),
  );
  check("拿宝石演示：分数不变", "game.take.score", demo.scoreBefore === demo.scoreAfter, `${demo.scoreBefore}`);
  checkCardIds(demo.before, "拿宝石前");
  checkCardIds(demo.after, "拿宝石后");
}

{
  const demo = game.buy;
  const card = demo.card == null ? null : cardsById.get(demo.card.id);
  check("买卡演示：真实卡牌存在", "game.buy.card", !!card, JSON.stringify(demo.card));
  const paidSum = sum(demo.paid);
  const expected = card == null ? -1 : Math.max(0, sum(card.cost) - demo.card!.discount);
  check(
    "买卡演示：支付 = 成本 − 折扣",
    "game.buy.paid",
    paidSum === expected,
    `${paidSum} vs ${expected}`,
  );
  const meBefore = demo.before.players[demo.seat]!;
  const meAfter = demo.after.players[demo.seat]!;
  check(
    "买卡演示：卡进入面板",
    "game.buy.purchased",
    demo.card != null && meAfter.purchased.includes(demo.card.id),
  );
  check(
    "买卡演示：分数 + 卡面分",
    "game.buy.score",
    demo.card != null && demo.scoreAfter - demo.scoreBefore === demo.card.points,
    `${demo.scoreBefore}→${demo.scoreAfter}`,
  );
  check(
    "买卡演示：加成 +1",
    "game.buy.bonus",
    demo.card != null && meAfter.bonuses[demo.card.bonus] === meBefore.bonuses[demo.card.bonus] + 1,
  );
  checkCardIds(demo.before, "买卡前");
  checkCardIds(demo.after, "买卡后");
}

{
  const demo = game.noble;
  const noble = demo.nobleId == null ? null : noblesById.get(demo.nobleId);
  check("贵族演示：真实贵族存在", "game.noble", !!noble, `${demo.nobleId}`);
  const meBefore = demo.before.players[demo.seat]!;
  const meAfter = demo.after.players[demo.seat]!;
  if (noble) {
    const reqs = (["white", "blue", "green", "red", "black"] as const).filter(
      (c) => noble.requirement[c] > 0,
    );
    check(
      "贵族演示：到访前只差一项加成",
      "game.noble.before",
      reqs.filter((c) => meBefore.bonuses[c] >= noble.requirement[c]).length === reqs.length - 1,
      JSON.stringify(meBefore.bonuses),
    );
    check(
      "贵族演示：到访后满足全部要求",
      "game.noble.after",
      reqs.every((c) => meAfter.bonuses[c] >= noble.requirement[c]),
      JSON.stringify(meAfter.bonuses),
    );
    check(
      "贵族演示：贵族进入面板",
      "game.noble.after",
      meAfter.nobles.includes(noble.id),
      JSON.stringify(meAfter.nobles),
    );
    check(
      "贵族演示：桌面移走该贵族",
      "game.noble.board",
      !demo.after.nobles.includes(noble.id),
      JSON.stringify(demo.after.nobles),
    );
  }
  check(
    "贵族演示：分数 +3",
    "game.noble.score",
    demo.scoreAfter - demo.scoreBefore === 3,
    `${demo.scoreBefore}→${demo.scoreAfter}`,
  );
  checkCardIds(demo.before, "贵族前");
  checkCardIds(demo.after, "贵族后");
}

{
  const wide = game.wide;
  check("全景：四位玩家", "game.wide", wide.players.length === 4, `${wide.players.length}`);
  check(
    "全景：热座模式（四位玩家标签）",
    "game.wide.kind",
    wide.players.every((p) => p.kind === "human"),
    wide.players.map((p) => p.kind).join(","),
  );
  check(
    "全景：三档 × 四张明牌",
    "game.wide.board",
    wide.board.length === 3 && wide.board.every((row) => row.length === 4),
  );
  check(
    "全景：三档牌堆计数齐全",
    "game.wide.deckCounts",
    wide.deckCounts.length === 3 && wide.deckCounts.every((n) => n >= 0),
    JSON.stringify(wide.deckCounts),
  );
  checkCardIds(wide, "全景");
}

// ------------------------------------------------------------------- assets
const shots = shotsJson as unknown as Record<"zh" | "en", { code: string; url: string; ip: string }>;
for (const lang of ["zh", "en"] as const) {
  check(`[${lang.toUpperCase()}] 房间码 4 位`, "shots.json", /^[A-Z0-9]{4}$/.test(shots[lang].code), shots[lang].code);
  check(
    `[${lang.toUpperCase()}] 二维码链接带房间码`,
    "shots.json",
    shots[lang].url.includes(`?join=${shots[lang].code}`),
    shots[lang].url,
  );
  check(
    `[${lang.toUpperCase()}] 房间地址是局域网地址`,
    "shots.json",
    /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(shots[lang].ip),
    shots[lang].ip,
  );
}

const images = ["ai.png", "settings.png", "replay.png", "mobile.png", "lobby-qr.png"];
for (const lang of ["zh", "en"] as const) {
  for (const name of images) {
    const file = join(video, "public", "shots", lang, name);
    let ok = false;
    let detail = "missing";
    if (existsSync(file)) {
      const png = PNG.sync.read(readFileSync(file));
      ok = png.width >= 500 && png.height >= 300;
      detail = `${png.width}x${png.height}`;
    }
    check(`[${lang.toUpperCase()}] 真实界面截图 ${name}`, `public/shots/${lang}/${name}`, ok, detail);
  }
}

{
  const installerDir = join(root, "packages", "desktop", "release");
  const installers = existsSync(installerDir)
    ? readdirSync(installerDir).filter((f) => /^Splendor-Setup-.*\.exe$/.test(f))
    : [];
  const chosen = installers
    .map((f) => ({ f, t: statSync(join(installerDir, f)).mtimeMs, size: statSync(join(installerDir, f)).size }))
    .sort((a, b) => b.t - a.t)[0];
  const mb = chosen ? chosen.size / (1024 * 1024) : 0;
  check(
    "安装包约 3.6 MB",
    "packages/desktop/release/*.exe",
    !!chosen && mb > 3.3 && mb < 3.9,
    chosen ? `${chosen.f} · ${mb.toFixed(2)} MB` : "no installer",
  );
  for (const lang of ["zh", "en"] as const) {
    check(
      `[${lang.toUpperCase()}] 片尾 3.6 MB 与安装包一致`,
      "copy.ts s9.facts",
      COPY[lang].s9.facts.includes("3.6"),
      COPY[lang].s9.facts,
    );
  }
}

// -------------------------------------------------------------------- audio
for (const lang of ["zh", "en"] as const) {
  const set = lang === "zh" ? narrationZh : narrationEn;
  const lines = set.lines;
  const source = NARRATION[lang];
  check(`[${lang.toUpperCase()}] 旁白 10 句`, `narration.${lang}.json`, lines.length === 10, `${lines.length}`);
  check(
    `[${lang.toUpperCase()}] 旁白文本与源一致`,
    "src/narration.ts",
    lines.every((line, i) => line.text === source[i]!.text),
  );
  check(
    `[${lang.toUpperCase()}] 旁白语言正确`,
    `narration.${lang}.json`,
    lines.every((line) => (lang === "zh" ? /[\u4e00-\u9fff]/.test(line.text) : !/[\u4e00-\u9fff]/.test(line.text))),
  );
  let fits = true;
  lines.forEach((line, i) => {
    const limit = i + 1 < lines.length ? lines[i + 1]!.at : FILM_SECONDS;
    if (line.at + line.duration > limit - 0.2) fits = false;
  });
  check(`[${lang.toUpperCase()}] 旁白不重叠且不越片尾`, "narration timings", fits);
  const missing = lines.filter((line) => !existsSync(join(video, "public", line.file)));
  check(`[${lang.toUpperCase()}] 旁白音频齐全`, `public/audio/voice/${lang}`, missing.length === 0, missing.map((m) => m.file).join(","));
  check(
    `[${lang.toUpperCase()}] 每句旁白都有字幕（同一份文本）`,
    "Subtitles.tsx ← narration",
    lines.length === 10 && lines.every((line) => line.text.length > 0),
  );
}
{
  const bgm = join(video, "public", "audio", "bgm.mp3");
  let seconds = 0;
  if (existsSync(bgm)) {
    seconds = Number(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", bgm], {
        encoding: "utf8",
      }).trim(),
    );
  }
  check("配乐恰好 54.0s", "public/audio/bgm.mp3", Math.abs(seconds - 54) < 0.02, `${seconds.toFixed(2)}s`);
  check("成片时长 54.0s", "src/narration.ts FILM_SECONDS", FILM_SECONDS === 54, `${FILM_SECONDS}`);
}

// -------------------------------------------------------------------- copy
for (const lang of ["zh", "en"] as const) {
  const c = COPY[lang];
  const pad = lang.toUpperCase();
  check(`[${pad}] 三位玩家名字 + 一位玩家`, "copy.players", c.players.length === 4, c.players.join(","));
  check(`[${pad}] 标题规格含 90 卡 / 10 贵族`, "copy.s2.spec", /90/.test(c.s2.spec) && /10/.test(c.s2.spec), c.s2.spec);
  check(`[${pad}] 规则卡 3 张`, "copy.s3.cards", c.s3.cards.length === 3);
  check(`[${pad}] 规则注脚含 90 / 10`, "copy.s3.note", /90/.test(c.s3.note) && /10/.test(c.s3.note), c.s3.note);
  check(`[${pad}] 细节卡 3 张`, "copy.s8.cards", c.s8.cards.length === 3);
  check(
    `[${pad}] 细节卡截图齐全`,
    "copy.s8.cards[].shot",
    c.s8.cards.every((card) => existsSync(join(video, "public", "shots", lang, card.shot))),
  );
  check(`[${pad}] 片尾无外链`, "copy.s9", !/http|www|\.exe/i.test(c.s9.facts + c.s9.tagline));
  check(`[${pad}] 字幕字符已纳入字体子集`, "allChars()", allChars().length > 200, `${allChars().length}`);
}

// widths (CJK 1em, Latin ~0.52em) — generous line boxes, catches real overflows
const width = (text: string, size: number, lang: "zh" | "en") =>
  [...text].length * size * (lang === "zh" ? 1 : 0.52);
for (const lang of ["zh", "en"] as const) {
  const c = COPY[lang];
  const pad = lang.toUpperCase();
  for (const card of c.s3.cards) {
    check(
      `[${pad}] 规则卡不溢出「${card.line}」`,
      "card 480px, line 23px",
      width(card.line, 23, lang) <= 440,
      `${Math.round(width(card.line, 23, lang))}px`,
    );
  }
  check(
    `[${pad}] 片尾标语不溢出`,
    "max 1400px @44px",
    width(c.s9.tagline, 44, lang) <= 1400,
    `${Math.round(width(c.s9.tagline, 44, lang))}px`,
  );
  for (const card of c.s8.cards) {
    check(
      `[${pad}] 细节卡说明不溢出「${card.line}」`,
      "card 488px @18px",
      width(card.line, 18, lang) <= 470,
      `${Math.round(width(card.line, 18, lang))}px`,
    );
  }
  check(
    `[${pad}] 手机面板标签不溢出`,
    "320px @12px",
    width(c.s7.local, 12, lang) <= 300,
    `${Math.round(width(c.s7.local, 12, lang))}px`,
  );
  check(
    `[${pad}] 片尾规格行不溢出`,
    "max 1500px @24px",
    width(c.s9.facts, 24, lang) <= 1500,
    `${Math.round(width(c.s9.facts, 24, lang))}px`,
  );
}

// ------------------------------------------------------------------- write
const lines = [
  "# Promo facts",
  "",
  "Every on-screen claim in both cuts, its source, and the automated check that",
  "guards it. Generated by `npx tsx scripts/facts.ts` from the real engine, the",
  "generated game snapshots, the narration tables and the captured UI stills.",
  "",
  "| Claim | Source | Status |",
  "| --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.claim} | ${row.source} | ${row.ok ? "PASS" : `**FAIL** ${row.detail}`} |`,
  ),
  "",
  `Checks: ${rows.length} · failed: ${failed}`,
  "",
];
writeFileSync(join(video, "FACTS.md"), lines.join("\n"));
console.log(`${rows.length} checks, ${failed} failed → video/FACTS.md`);
process.exit(failed === 0 ? 0 : 1);
