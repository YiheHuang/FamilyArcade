import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const narration = JSON.parse(readFileSync(path.join(root, 'scripts/narration.json'), 'utf8'));

function duration(file) {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
    { encoding: 'utf8' },
  );
  return Number(out.trim());
}

for (const lang of ['zh', 'en']) {
  const spec = narration[lang];
  const dir = path.join(root, 'public', 'audio', 'voice', lang);
  mkdirSync(dir, { recursive: true });
  const lines = [];
  for (let i = 0; i < spec.lines.length; i++) {
    const line = spec.lines[i];
    const file = path.join(dir, `line-${i + 1}.mp3`);
    console.log(`[${lang}] ${i + 1}/${spec.lines.length}: ${line.text}`);
    execFileSync(
      'python',
      ['-m', 'edge_tts', '--voice', spec.voice, '--rate=-6%', '--text', line.text, '--write-media', file],
      { stdio: 'inherit' },
    );
    const seconds = duration(file);
    lines.push({
      at: line.at,
      text: line.text,
      file: `audio/voice/${lang}/line-${i + 1}.mp3`,
      duration: Number(seconds.toFixed(2)),
    });
  }
  for (let i = 0; i < lines.length - 1; i++) {
    const end = lines[i].at + lines[i].duration;
    if (end > lines[i + 1].at) {
      console.warn(`[${lang}] line ${i + 1} ends at ${end.toFixed(2)}s, overlaps line ${i + 2} at ${lines[i + 1].at}s`);
    }
  }
  writeFileSync(path.join(root, 'src', 'data', `narration.${lang}.json`), JSON.stringify({ lines }, null, 2));
}
