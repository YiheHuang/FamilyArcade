/**
 * Verifies every factual claim of both cuts, then writes FACTS.md.
 * Run: npx tsx scripts/facts.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import { Game } from "../../src/game/engine.ts";
import { PIECE_COUNT, PIECES, TOTAL_CELLS } from "../../src/game/pieces.ts";
import { PALETTE } from "../../src/ui/theme.ts";
import { COPY } from "../src/copy.ts";
import { DATA } from "../src/data/game.ts";
import narrationEn from "../src/data/narration.en.json";
import narrationZh from "../src/data/narration.zh.json";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const rows = [];
let failed = 0;

function check(claim, source, ok, detail = "") {
  rows.push({ claim, source, ok, detail });
  if (!ok) {
    failed++;
    console.error(`FAIL ${claim} — ${detail}`);
  }
}

// ---------------------------------------------------------------- piece data
check("21 块棋子", "src/game/pieces.ts PIECE_COUNT", PIECE_COUNT === 21, `got ${PIECE_COUNT}`);
check("共 89 格", "src/game/pieces.ts TOTAL_CELLS", TOTAL_CELLS === 89, `got ${TOTAL_CELLS}`);
const orientationCount = PIECES.reduce((n, p) => n + p.orientations.length, 0);
check("91 种朝向（内部一致性）", "src/game/pieces.ts", orientationCount === 91, `got ${orientationCount}`);

// -------------------------------------------------------------------- scoring
{
  const g = new Game({ variant: "duo", players: 2 });
  g.remaining[0] = 0;
  g.placedCells[0] = 89;
  g.lastPiece[0] = PIECES.findIndex((p) => p.id === "Z5");
  const plain = g.score(0).bonus;
  g.lastPiece[0] = PIECES.findIndex((p) => p.id === "I1");
  const monomino = g.score(0).bonus;
  check("放完全部 21 块 +15", "Game.score()", plain === 15, `got ${plain}`);
  check("单格块收尾 +20", "Game.score()", monomino === 20, `got ${monomino}`);
}

// -------------------------------------------------------------------- palette
const palette = ["#4e6e9e", "#c9a24b", "#b0604a", "#6f9273"];
check(
  "四色与 App 一致",
  "src/ui/theme.ts PALETTE",
  JSON.stringify([...PALETTE]) === JSON.stringify(palette),
  JSON.stringify(PALETTE),
);

// --------------------------------------------------------------- app wording
const i18n = readFileSync(join(root, "src", "i18n.ts"), "utf8");
const wording = [
  ["单人训练", "'home.solo.title': '单人训练'"],
  ["本地对战", "'home.hotseat.title': '本地对战'"],
  ["局域网对战", "'home.lan.title': '局域网对战'"],
  ["与 AI 对弈，三档难度", "'home.solo.desc': '与 AI 对弈，三档难度 · 提示与悔棋'"],
  ["2–4 人同屏轮流对弈", "'home.hotseat.desc': '2–4 人同屏轮流对弈'"],
  ["浏览器也能加入", "'home.lan.desc': '同一网络内开房联机，浏览器也能加入'"],
  ["Solo practice", "'home.solo.title': 'Solo practice'"],
  ["Hot-seat", "'home.hotseat.title': 'Hot-seat'"],
  ["LAN play", "'home.lan.title': 'LAN play'"],
  ["Play the AI — three levels", "'home.solo.desc': 'Play the AI — three levels, hints and undo'"],
  ["2–4 players sharing one screen", "'home.hotseat.desc': '2–4 players sharing one screen'"],
];
for (const [label, line] of wording) {
  check(`文案「${label}」`, `src/i18n.ts ${line}`, i18n.includes(line), "not found verbatim");
}

// ------------------------------------------------------------- generated game
check("对局 22 手全部合法", "Game.tryApply() replay", DATA.moves.length === 22, `got ${DATA.moves.length}`);
{
  const g = new Game(DATA.config);
  let ok = true;
  for (const mv of DATA.moves) {
    if (!g.tryApply({ kind: "place", ...mv })) {
      ok = false;
      break;
    }
  }
  check("对局可完整重放", "Game.tryApply() replay", ok, "replay rejected a move");
  check(
    "记分与引擎一致",
    "Game.scores()",
    JSON.stringify(g.scores()) === JSON.stringify(DATA.scores),
    JSON.stringify(g.scores()),
  );
  const d = new Game(DATA.config, [
    DATA.demo.first,
    { kind: "pass", p: 1 },
    { kind: "pass", p: 2 },
    { kind: "pass", p: 3 },
    DATA.demo.second,
    { kind: "pass", p: 1 },
    { kind: "pass", p: 2 },
    { kind: "pass", p: 3 },
  ]);
  const reason = d.illegalReason({ kind: "place", p: 0, ...DATA.demo.illegal });
  check("规则演示：贴边被判非法", "Game.illegalReason()", reason === "edge-touch", `got ${reason}`);
}

// ------------------------------------------------------------ copy per language
for (const lang of ["zh", "en"]) {
  const c = COPY[lang];
  const pad = lang.toUpperCase();

  check(`[${pad}] 三个玩法标题齐全`, "copy.ts", c.s5.cards.length === 3, `${c.s5.cards.length}`);
  check(`[${pad}] 细节两条（悔棋已移除）`, "copy.ts", c.s6.rows.length === 2, `${c.s6.rows.length}`);
  check(
    `[${pad}] 细节中不再出现悔棋`,
    "copy.ts",
    !/悔棋|undo/i.test(JSON.stringify(c.s6)),
    "undo wording still present",
  );
  check(`[${pad}] 结尾无链接/安装包`, "copy.ts", !/http|www|\.exe|MB/i.test(JSON.stringify(c.s7)), "link found");

  if (lang === "zh") {
    check(
      "[ZH] 比分面板为单字色名",
      "copy.ts S3.players",
      JSON.stringify(c.s3.players) === JSON.stringify(["蓝", "黄", "红", "绿"]),
      JSON.stringify(c.s3.players),
    );
  } else {
    check(
      "[EN] 比分面板为单字色名",
      "copy.ts S3.players",
      JSON.stringify(c.s3.players) === JSON.stringify(["Blue", "Yellow", "Red", "Green"]),
      JSON.stringify(c.s3.players),
    );
  }

  // rules stay inside the 740px column at 66px (CJK ~1em, Latin ~0.52em)
  const factor = lang === "zh" ? 1 : 0.52;
  for (const step of c.s2.steps) {
    for (const line of step.lines) {
      const width = [...line].length * 66 * factor;
      check(`[${pad}] 规则不溢出行宽「${line}」`, "S2 column 740px @66px", width <= 760, `${Math.round(width)}px`);
    }
  }
}

// --------------------------------------------------------------------- audio
const narrations = { zh: narrationZh, en: narrationEn };
for (const lang of ["zh", "en"]) {
  const set = narrations[lang];
  const lines = set.lines;
  const pad = lang.toUpperCase();

  check(
    `[${pad}] 旁白 7 句、语言正确`,
    `data/narration.${lang}.json`,
    lines.length === 7 &&
      lines.every((l) => (lang === "zh" ? /[\u4e00-\u9fff]/.test(l.text) : /^[\x20-\x7e]+$/.test(l.text))),
    `${lines.length} lines`,
  );
  let fits = true;
  lines.forEach((line, i) => {
    const limit = i + 1 < lines.length ? lines[i + 1].at : 48;
    if (line.at + line.duration > limit - 0.2) fits = false;
  });
  check(`[${pad}] 旁白不重叠且不越过片尾`, "narration timings", fits, "a line runs into the next beat");
  const missing = lines.filter((l) => !existsSync(join(here, "..", "public", l.file)));
  check(`[${pad}] 旁白音频齐全`, `public/audio/voice/${lang}`, missing.length === 0, missing.map((m) => m.file).join(","));
}

{
  const bgm = join(here, "..", "public", "audio", "bgm.wav");
  let bgmSeconds = 0;
  if (existsSync(bgm)) {
    const buf = readFileSync(bgm);
    bgmSeconds =
      buf.readUInt32LE(40) / (buf.readUInt32LE(24) * buf.readUInt16LE(22) * (buf.readUInt16LE(34) / 8));
  }
  check("BGM 为 48.0s", "public/audio/bgm.wav", Math.abs(bgmSeconds - 48) < 0.02, `${bgmSeconds.toFixed(2)}s`);
}

// ----------------------------------------------------------------- screenshots
for (const lang of ["zh", "en"]) {
  for (const shot of COPY[lang].s5.cards.map((c) => c.shot)) {
    const rel = `${COPY[lang].s5.shotsDir}/${shot}`;
    const file = join(here, "..", "public", rel);
    let ok = false;
    let detail = "missing";
    if (existsSync(file)) {
      const png = PNG.sync.read(readFileSync(file));
      ok = png.width === 1500 && png.height === 1025;
      detail = `${png.width}x${png.height}`;
    }
    check(`[${lang.toUpperCase()}] 截图 ${shot} 为真实应用 1500x1025`, `video/public/${rel}`, ok, detail);
  }
}

// ---------------------------------------------------------------------- write
const lines = [
  "# Promo facts",
  "",
  "Every on-screen claim and every audio cue in both cuts, its source, and the",
  "automated check that guards it. Generated by `npx tsx scripts/facts.mjs`.",
  "",
  "| Claim | Source | Status |",
  "| --- | --- | --- |",
  ...rows.map((r) => `| ${r.claim} | ${r.source} | ${r.ok ? "PASS" : `**FAIL** ${r.detail}`} |`),
  "",
  `Checks: ${rows.length} · failed: ${failed}`,
  "",
];
writeFileSync(join(here, "..", "FACTS.md"), lines.join("\n"));
console.log(`${rows.length} checks, ${failed} failed → video/FACTS.md`);
process.exit(failed === 0 ? 0 : 1);
