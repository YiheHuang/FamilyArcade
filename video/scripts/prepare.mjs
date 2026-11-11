#!/usr/bin/env node
/**
 * Collect every arcade video.json, copy the real screenshots into the Remotion
 * public folder, generate the bilingual voice jobs / SRTs and write games.json.
 *
 *   node scripts/prepare.mjs            # screenshots + music + voices + SRT
 *   node scripts/prepare.mjs --no-voice # skip Edge TTS (offline / CI)
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const repo = path.resolve(root, '..');
const skip = new Set(['star-leap', 'sweet-carousel', 'hue-garden', 'field-and-wall', 'balloon-rally', 'splendor']);
const noVoice = process.argv.includes('--no-voice');

const apps = readdirSync(path.join(repo, 'apps')).filter((slug) => !skip.has(slug));
const games = [];
const voiceJobs = [];

function stamp(seconds) {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function duration(file) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return Number(out.trim());
  } catch {
    return 3;
  }
}

for (const slug of apps) {
  const manifestPath = path.join(repo, 'apps', slug, 'video.json');
  if (!existsSync(manifestPath)) continue;
  const game = JSON.parse(readFileSync(manifestPath, 'utf8'));
  game.slug = slug;
  const screens = { en: [], zh: [] };
  for (const lang of ['en', 'zh']) {
    const sourceLang = lang;
    const candidates = [
      path.join(repo, 'apps', slug, 'docs', 'screenshots', sourceLang),
      path.join(repo, 'apps', slug, 'docs', 'screenshots', 'en'),
      path.join(repo, 'apps', slug, 'docs', 'screenshots'),
    ].filter((dir) => existsSync(dir));
    const targetDir = path.join(root, 'public', 'shots', slug, lang);
    mkdirSync(targetDir, { recursive: true });
    const requested = game.screens?.[sourceLang] ?? game.screens?.en ?? [];
    for (const file of requested) {
      const sourceDir = candidates.find((dir) => existsSync(path.join(dir, file)));
      if (!sourceDir) {
        console.warn(`${slug}/${lang}: missing ${file}`);
        continue;
      }
      copyFileSync(path.join(sourceDir, file), path.join(targetDir, file));
      screens[lang].push(file);
    }
    if (screens[lang].length === 0) {
      const flat = candidates[0];
      if (flat) {
        const first = readdirSync(flat).find((file) => file.endsWith('.png'));
        if (first) {
          copyFileSync(path.join(flat, first), path.join(targetDir, first));
          screens[lang].push(first);
        }
      }
    }
  }
  game.screens = screens;
  const lines = (game.lines ?? []).map((line, index) => {
    const enFile = `voice/${slug}/en/line-${index + 1}.mp3`;
    const zhFile = `voice/${slug}/zh/line-${index + 1}.mp3`;
    const voiceDir = path.join(root, 'public', 'voice', slug);
    mkdirSync(path.join(voiceDir, 'en'), { recursive: true });
    mkdirSync(path.join(voiceDir, 'zh'), { recursive: true });
    voiceJobs.push(
      { text: line.en, voice: 'en-US-AvaNeural', out: path.join(voiceDir, 'en', `line-${index + 1}.mp3`) },
      { text: line.zh, voice: 'zh-CN-XiaoxiaoNeural', out: path.join(voiceDir, 'zh', `line-${index + 1}.mp3`) },
    );
    return {
      ...line,
      enFile,
      zhFile,
      enDuration: duration(path.join(voiceDir, 'en', `line-${index + 1}.mp3`)),
      zhDuration: duration(path.join(voiceDir, 'zh', `line-${index + 1}.mp3`)),
    };
  });
  game.lines = lines;
  games.push(game);

  const promoDir = path.join(repo, 'apps', slug, 'docs', 'promo');
  mkdirSync(promoDir, { recursive: true });
  for (const lang of ['en', 'zh']) {
    const blocks = lines.map((line, index) => {
      const start = line.at;
      const next = index + 1 < lines.length ? lines[index + 1].at - 0.05 : 44.4;
      const dur = lang === 'zh' ? line.zhDuration : line.enDuration;
      const end = Math.min(44.4, line.at + Math.max(1.8, dur + 0.35), next);
      return `${index + 1}\n${stamp(start)} --> ${stamp(end)}\n${lang === 'zh' ? line.zh : line.en}\n`;
    });
    writeFileSync(path.join(promoDir, `${slug}-promo-${lang}.srt`), blocks.join('\n'), 'utf8');
  }
  console.log(`prepared ${slug}: ${screens.en.length} en / ${screens.zh.length} zh shots, ${lines.length} lines`);
}

games.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.slug.localeCompare(b.slug));
mkdirSync(path.join(root, 'src', 'data'), { recursive: true });
writeFileSync(path.join(root, 'src', 'data', 'games.json'), `${JSON.stringify(games, null, 2)}\n`);

// Original 45-second synth bed, generated only once.
const bed = path.join(root, 'public', 'audio', 'bed.wav');
if (!existsSync(bed)) {
  mkdirSync(path.dirname(bed), { recursive: true });
  const sampleRate = 44100;
  const seconds = 46;
  const total = sampleRate * seconds;
  const data = new Float64Array(total);
  const chords = [
    [261.63, 329.63, 392.0],
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [196.0, 246.94, 293.66],
  ];
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const chord = chords[Math.floor(t / 8) % chords.length];
    const local = t % 8;
    const envelope = Math.min(1, local / 0.8) * Math.min(1, (8 - local) / 1.2);
    let value = 0;
    for (const freq of chord) value += Math.sin(2 * Math.PI * freq * t) * 0.015 * envelope;
    const bell = t % 1;
    if (bell < 1) value += Math.sin(2 * Math.PI * 523.25 * 2 * t) * 0.03 * Math.exp(-bell * 4);
    data[i] = Math.max(-0.7, Math.min(0.7, value));
  }
  const bytes = Buffer.alloc(44 + total * 2);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + total * 2, 4);
  bytes.write('WAVE', 8);
  bytes.write('fmt ', 12);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) bytes.writeInt16LE(Math.round(data[i] * 32767), 44 + i * 2);
  writeFileSync(bed, bytes);
  console.log('generated public/audio/bed.wav');
}

if (!noVoice) {
  const jobsPath = path.join(root, 'scripts', 'voice-jobs.json');
  writeFileSync(jobsPath, JSON.stringify(voiceJobs, null, 2));
  console.log(`synthesising ${voiceJobs.length} voice clips…`);
  execFileSync('python', [path.join(root, 'scripts', 'voice.py'), jobsPath], { stdio: 'inherit' });
  rmSync(jobsPath, { force: true });
  // Re-read durations after synthesis.
  for (const game of games) {
    game.lines = game.lines.map((line, index) => ({
      ...line,
      enDuration: duration(path.join(root, 'public', 'voice', game.slug, 'en', `line-${index + 1}.mp3`)),
      zhDuration: duration(path.join(root, 'public', 'voice', game.slug, 'zh', `line-${index + 1}.mp3`)),
    }));
  }
  writeFileSync(path.join(root, 'src', 'data', 'games.json'), `${JSON.stringify(games, null, 2)}\n`);
}

console.log(`wrote ${games.length} games to src/data/games.json`);
