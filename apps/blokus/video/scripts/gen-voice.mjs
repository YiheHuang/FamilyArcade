/**
 * Generates both narrations with Microsoft Edge's neural voices (natural
 * prosody, not a robotic formant synth) and writes the timing tables used by
 * Remotion.
 *
 * Run: node scripts/gen-voice.mjs [zh|en|all]
 *   zh  zh-CN-YunxiNeural   (warm male)
 *   en  en-US-AndrewNeural  (warm, conversational male)
 *
 * Each line is measured with ffprobe; the script refuses to write timings when
 * lines would overlap or run past the end of the film.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DURATION = 48;
const RATE = "-6%"; // a touch slower: calmer, less "assistant"

const LANGS = {
  zh: {
    voice: "zh-CN-YunxiNeural",
    dir: join(here, "..", "public", "audio", "voice", "zh"),
    data: join(here, "..", "src", "data", "narration.zh.json"),
    lines: [
      { at: 1.2, text: "周末晚上，来一局角斗士棋。" },
      { at: 5.4, text: "规则只有三条：盖住角落，对角相连，不要边贴边。" },
      { at: 14.6, text: "四个人，一人一角，每一步都在抢地盘。" },
      { at: 24.2, text: "放完全部棋子，还有额外奖励。" },
      { at: 29.6, text: "一个人练，一家人同屏，或者手机扫码联机。" },
      { at: 36.9, text: "暂停、观战，也都替你想好了。" },
      { at: 42.6, text: "离线运行，没有广告，数据只留在家里。" },
    ],
  },
  en: {
    voice: "en-US-AndrewNeural",
    dir: join(here, "..", "public", "audio", "voice", "en"),
    data: join(here, "..", "src", "data", "narration.en.json"),
    lines: [
      { at: 1.2, text: "Weekend night. One more game." },
      {
        at: 5.4,
        text: "Three rules: cover your corner, connect corner to corner, and never edge to edge.",
      },
      { at: 14.6, text: "Four players, one corner each. Every move claims a little more board." },
      { at: 24.2, text: "Place all twenty-one pieces for a bonus." },
      { at: 29.6, text: "Play solo, share one screen, or join from a phone with a QR code." },
      { at: 36.9, text: "Pause the table, or let a fifth phone watch." },
      { at: 42.6, text: "Offline, no ads. Your data stays home." },
    ],
  },
};

const probe = (file) =>
  Number(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { encoding: "utf8" },
    ).trim(),
  );

function generate(lang, spec) {
  mkdirSync(spec.dir, { recursive: true });
  console.log(`\n${lang}: ${spec.voice} @ ${RATE}`);
  const table = [];
  spec.lines.forEach((line, i) => {
    const file = `line-${i + 1}.mp3`;
    const target = join(spec.dir, file);
    execFileSync(
      "python",
      ["-m", "edge_tts", "--voice", spec.voice, `--rate=${RATE}`, "--text", line.text, "--write-media", target],
      { stdio: "inherit" },
    );
    const duration = probe(target);
    table.push({
      at: line.at,
      file: `audio/voice/${lang}/${file}`,
      duration,
      text: line.text,
    });
    console.log(`${file.padEnd(12)} ${duration.toFixed(2)}s  @${line.at}s  ${line.text}`);
  });

  let failed = 0;
  for (let i = 0; i < table.length; i++) {
    const a = table[i];
    const limit = i + 1 < table.length ? table[i + 1].at : DURATION;
    if (a.at + a.duration > limit - 0.25) {
      failed++;
      console.error(
        `${lang} line ${i + 1} runs into the next beat (${(a.at + a.duration).toFixed(2)}s > ${limit}s)`,
      );
    }
  }
  if (failed > 0) {
    throw new Error(`${lang}: shorten a line or move its start`);
  }

  writeFileSync(
    spec.data,
    `${JSON.stringify({ lang, voice: spec.voice, rate: RATE, lines: table }, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `wrote ${spec.data} (${table.length} lines, ${table.reduce((s, l) => s + l.duration, 0).toFixed(1)}s of speech)`,
  );
}

const which = process.argv[2] ?? "all";
for (const [lang, spec] of Object.entries(LANGS)) {
  if (which !== "all" && which !== lang) continue;
  generate(lang, spec);
}
