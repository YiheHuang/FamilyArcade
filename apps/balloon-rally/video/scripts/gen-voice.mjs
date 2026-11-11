import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'src', 'data');
const audioDir = path.join(root, 'public', 'audio', 'voice');

const cfg = {
  en: { voice: 'en-US-AriaNeural', rate: '+8%' },
  zh: { voice: 'zh-CN-XiaoxiaoNeural', rate: '+8%' },
};

for (const lang of ['en', 'zh']) {
  const file = path.join(dataDir, `narration.${lang}.json`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const outDir = path.join(audioDir, lang);
  mkdirSync(outDir, { recursive: true });
  data.lines.forEach((line, index) => {
    const out = path.join(outDir, `line-${index + 1}.mp3`);
    execFileSync(
      'edge-tts',
      ['--voice', cfg[lang].voice, `--rate=${cfg[lang].rate}`, '--text', line.text, '--write-media', out],
      { stdio: 'inherit' },
    );
    const durationText = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', out],
      { encoding: 'utf8' },
    );
    const voiced = Number.parseFloat(durationText.trim());
    line.voDuration = Number(voiced.toFixed(2));
    line.file = `audio/voice/${lang}/line-${index + 1}.mp3`;
    const nextAt = data.lines[index + 1]?.at ?? 45;
    const gap = Math.max(0.8, nextAt - line.at - 0.12);
    line.duration = Number(Math.min(45 - line.at - 0.15, gap, line.voDuration + 0.35).toFixed(2));
    console.log(`${lang} ${index + 1}: ${line.voDuration}s voiced, ${line.duration}s slot`);
  });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
