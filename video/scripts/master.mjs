#!/usr/bin/env node
/**
 * Loudness-master every rendered promo to about -14 LUFS / <= -1 dBTP, copy it
 * into the game's docs/promo, and extract a 1920x1080 poster.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const repo = path.resolve(root, '..');
const games = JSON.parse(readFileSync(path.join(root, 'src', 'data', 'games.json'), 'utf8'));
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(',').map((slug) => slug.trim()).filter(Boolean)) : null;

function measure(file) {
  const out = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const text = `${out.stderr ?? ''}${out.stdout ?? ''}`;
  const matches = [...text.matchAll(/\{[\s\S]*?"input_i"[\s\S]*?\}/g)];
  if (!matches.length) return { i: -99, tp: -99 };
  const data = JSON.parse(matches[matches.length - 1][0]);
  return { i: Number(data.input_i), tp: Number(data.input_tp) };
}

for (const game of games) {
  if (only && !only.has(game.slug)) continue;
  const promoDir = path.join(repo, 'apps', game.slug, 'docs', 'promo');
  mkdirSync(promoDir, { recursive: true });
  const report = {};
  for (const lang of ['en', 'zh']) {
    const raw = path.join(root, 'out', `${game.slug}-${lang}.mp4`);
    if (!existsSync(raw)) {
      console.warn(`missing ${raw}`);
      continue;
    }
    const final = path.join(promoDir, `${game.slug}-promo-${lang}.mp4`);
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        raw,
        '-c:v',
        'copy',
        '-af',
        'loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.89:level=false:attack=5:release=50',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-movflags',
        '+faststart',
        final,
      ],
      { stdio: 'ignore' },
    );
    const poster = path.join(promoDir, `${game.slug}-poster-${lang}.png`);
    execFileSync(
      'ffmpeg',
      ['-y', '-ss', '2.6', '-i', final, '-frames:v', '1', '-update', '1', poster],
      { stdio: 'ignore' },
    );
    const m = measure(final);
    report[lang] = {
      lufs: Number(m.i.toFixed(2)),
      truePeak: Number(m.tp.toFixed(2)),
      bytes: statSync(final).size,
    };
    console.log(`${game.slug}/${lang}: ${m.i.toFixed(2)} LUFS, ${m.tp.toFixed(2)} dBTP, ${(statSync(final).size / 1048576).toFixed(2)} MB`);
  }
  writeFileSync(path.join(promoDir, 'audio-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
console.log('master done');
