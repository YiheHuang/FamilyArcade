/**
 * Generates both narrations with Microsoft Edge's neural voices and writes the
 * measured timing tables used by Remotion and the subtitles.
 *
 * Run: npx tsx scripts/gen-voice.ts [zh|en|all]
 *   zh  zh-CN-YunxiNeural    (warm male)
 *   en  en-US-AndrewNeural   (warm, conversational male)
 *
 * Each line is measured with ffprobe. The script refuses to write timings when
 * a line would overlap the next beat or run past the end of the film.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { FILM_SECONDS, NARRATION } from "../src/narration.ts";

const here = dirname(fileURLToPath(import.meta.url));
const RATE = "-6%"; // a touch slower: calmer, less "assistant"

const LANGS = {
  zh: {
    voice: "zh-CN-YunxiNeural",
    dir: join(here, "..", "public", "audio", "voice", "zh"),
    data: join(here, "..", "src", "data", "narration.zh.json"),
  },
  en: {
    voice: "en-US-AndrewNeural",
    dir: join(here, "..", "public", "audio", "voice", "en"),
    data: join(here, "..", "src", "data", "narration.en.json"),
  },
} as const;

const probe = (file: string): number =>
  Number(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
      { encoding: "utf8" },
    ).trim(),
  );

function generate(lang: "zh" | "en") {
  const spec = LANGS[lang];
  const lines = NARRATION[lang];
  mkdirSync(spec.dir, { recursive: true });
  console.log(`\n${lang}: ${spec.voice} @ ${RATE}`);
  const table: Array<{ at: number; file: string; duration: number; text: string }> = [];

  lines.forEach((line, i) => {
    const file = `line-${i + 1}.mp3`;
    const target = join(spec.dir, file);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        execFileSync(
          "python",
          [
            "-m",
            "edge_tts",
            "--voice",
            spec.voice,
            `--rate=${RATE}`,
            "--text",
            line.text,
            "--write-media",
            target,
          ],
          { stdio: "inherit" },
        );
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError) throw lastError;

    const duration = probe(target);
    table.push({ at: line.at, file: `audio/voice/${lang}/${file}`, duration, text: line.text });
    console.log(
      `${file.padEnd(10)} ${duration.toFixed(2)}s  @${line.at.toFixed(1)}s  ${line.text}`,
    );
  });

  let failed = 0;
  for (let i = 0; i < table.length; i++) {
    const line = table[i]!;
    const limit = i + 1 < table.length ? table[i + 1]!.at : FILM_SECONDS;
    if (line.at + line.duration > limit - 0.2) {
      failed++;
      console.error(
        `${lang} line ${i + 1} runs into the next beat (${(line.at + line.duration).toFixed(2)}s > ${limit}s)`,
      );
    }
  }
  if (failed > 0) throw new Error(`${lang}: shorten a line or move its start`);

  writeFileSync(
    spec.data,
    `${JSON.stringify({ lang, voice: spec.voice, rate: RATE, lines: table }, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `wrote ${spec.data} (${table.length} lines, ${table.reduce((s, l) => s + l.duration, 0).toFixed(1)}s of speech)`,
  );
}

const which = (process.argv[2] ?? "all") as "zh" | "en" | "all";
for (const lang of ["zh", "en"] as const) {
  if (which !== "all" && which !== lang) continue;
  generate(lang);
}
