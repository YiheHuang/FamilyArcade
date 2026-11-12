#!/usr/bin/env node
/** Build the repository tour from the real English promos. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const repo = path.resolve(root, '..');
const out = path.join(repo, 'docs', 'tour.mp4');
const work = path.join(root, 'out', 'tour');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const order = [
  ['star-leap', 'apps/star-leap/docs/promo/star-leap-promo-en.mp4'],
  ['sweet-carousel', 'apps/sweet-carousel/docs/promo/sweet-carousel-promo-en.mp4'],
  ['hue-garden', 'apps/hue-garden/docs/promo/hue-garden-promo-en.mp4'],
  ['field-and-wall', 'apps/field-and-wall/docs/promo/field-and-wall-promo-en.mp4'],
  ['balloon-rally', 'apps/balloon-rally/docs/promo/balloon-rally-promo-en.mp4'],
  ['blokus', 'apps/blokus/docs/promo/blokus-promo-en.mp4'],
  ['splendor', 'apps/splendor/docs/promo/splendor-promo-en.mp4'],
  ['gomoku', 'video/out/gomoku-en.mp4'],
  ['xiangqi', 'video/out/xiangqi-en.mp4'],
  ['chess', 'video/out/chess-en.mp4'],
  ['go', 'video/out/go-en.mp4'],
  ['shogi', 'video/out/shogi-en.mp4'],
  ['intl-draughts', 'video/out/intl-draughts-en.mp4'],
  ['jungle-chess', 'video/out/jungle-chess-en.mp4'],
  ['quarto', 'video/out/quarto-en.mp4'],
  ['abalone', 'video/out/abalone-en.mp4'],
  ['hive', 'video/out/hive-en.mp4'],
  ['hearts', 'video/out/hearts-en.mp4'],
  ['spades', 'video/out/spades-en.mp4'],
  ['rummy-500', 'video/out/rummy-500-en.mp4'],
  ['cribbage', 'video/out/cribbage-en.mp4'],
  ['president', 'video/out/president-en.mp4'],
  ['triple', 'video/out/triple-en.mp4'],
  ['four', 'video/out/four-en.mp4'],
  ['flip', 'video/out/flip-en.mp4'],
  ['draughts', 'video/out/draughts-en.mp4'],
  ['mill', 'video/out/mill-en.mp4'],
  ['boxes', 'video/out/boxes-en.mp4'],
  ['sowing', 'video/out/sowing-en.mp4'],
  ['tables', 'video/out/tables-en.mp4'],
  ['race-home', 'video/out/race-home-en.mp4'],
  ['ladder-run', 'video/out/ladder-run-en.mp4'],
  ['pair-up', 'video/out/pair-up-en.mp4'],
  ['domino-line', 'video/out/domino-line-en.mp4'],
  ['color-chain', 'video/out/color-chain-en.mp4'],
  ['five-dice', 'video/out/five-dice-en.mp4'],
  ['fleet', 'video/out/fleet-en.mp4'],
  ['codebreak', 'video/out/codebreak-en.mp4'],
  ['triple-find', 'video/out/triple-find-en.mp4'],
  ['little-go', 'video/out/little-go-en.mp4'],
  ['mini-chess', 'video/out/mini-chess-en.mp4'],
  ['hex', 'video/out/hex-en.mp4'],
];

const files = [];
let index = 0;
for (const [slug, rel] of order) {
  const input = path.join(repo, rel);
  if (!existsSync(input)) {
    console.warn(`skip ${slug}: missing ${rel}`);
    continue;
  }
  const clip = path.join(work, `${String(index++).padStart(2, '0')}-${slug}.mp4`);
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-ss',
      '2.5',
      '-t',
      '1.15',
      '-i',
      input,
      '-vf',
      'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0xf7f0e2,fps=60',
      '-an',
      '-c:v',
      'libx264',
      '-crf',
      '21',
      '-preset',
      'fast',
      '-pix_fmt',
      'yuv420p',
      clip,
    ],
    { stdio: 'ignore' },
  );
  files.push(clip);
}

const open = path.join(work, 'open.mp4');
execFileSync(
  'ffmpeg',
  ['-y', '-loop', '1', '-t', '3', '-i', path.join(repo, 'docs', 'cover.png'), '-vf', 'fps=60,scale=1920:1080', '-an', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', open],
  { stdio: 'ignore' },
);
files.unshift(open);
files.push(open);

const list = path.join(work, 'list.txt');
writeFileSync(list, files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join('\n'));
const silent = path.join(work, 'silent.mp4');
execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent], { stdio: 'ignore' });

const duration = Number(
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', silent], {
    encoding: 'utf8',
  }).trim(),
);
const bed = path.join(root, 'public', 'audio', 'bed.wav');
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    silent,
    '-i',
    bed,
    '-t',
    String(duration),
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-af',
    'volume=0.5,afade=t=in:st=0:d=1,afade=t=out:st=' + Math.max(0, duration - 2) + ':d=2',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    out,
  ],
  { stdio: 'ignore' },
);
console.log(`tour: ${out} (${duration.toFixed(1)} s, ${files.length - 2} games)`);
