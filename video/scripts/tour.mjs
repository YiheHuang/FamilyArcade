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
  ['gomoku', 'apps/gomoku/docs/promo/gomoku-promo-en.mp4'],
  ['xiangqi', 'apps/xiangqi/docs/promo/xiangqi-promo-en.mp4'],
  ['chess', 'apps/chess/docs/promo/chess-promo-en.mp4'],
  ['go', 'apps/go/docs/promo/go-promo-en.mp4'],
  ['shogi', 'apps/shogi/docs/promo/shogi-promo-en.mp4'],
  ['intl-draughts', 'apps/intl-draughts/docs/promo/intl-draughts-promo-en.mp4'],
  ['jungle-chess', 'apps/jungle-chess/docs/promo/jungle-chess-promo-en.mp4'],
  ['quarto', 'apps/quarto/docs/promo/quarto-promo-en.mp4'],
  ['abalone', 'apps/abalone/docs/promo/abalone-promo-en.mp4'],
  ['hive', 'apps/hive/docs/promo/hive-promo-en.mp4'],
  ['hearts', 'apps/hearts/docs/promo/hearts-promo-en.mp4'],
  ['spades', 'apps/spades/docs/promo/spades-promo-en.mp4'],
  ['rummy-500', 'apps/rummy-500/docs/promo/rummy-500-promo-en.mp4'],
  ['cribbage', 'apps/cribbage/docs/promo/cribbage-promo-en.mp4'],
  ['president', 'apps/president/docs/promo/president-promo-en.mp4'],
  ['triple', 'apps/triple/docs/promo/triple-promo-en.mp4'],
  ['four', 'apps/four/docs/promo/four-promo-en.mp4'],
  ['flip', 'apps/flip/docs/promo/flip-promo-en.mp4'],
  ['draughts', 'apps/draughts/docs/promo/draughts-promo-en.mp4'],
  ['mill', 'apps/mill/docs/promo/mill-promo-en.mp4'],
  ['boxes', 'apps/boxes/docs/promo/boxes-promo-en.mp4'],
  ['sowing', 'apps/sowing/docs/promo/sowing-promo-en.mp4'],
  ['tables', 'apps/tables/docs/promo/tables-promo-en.mp4'],
  ['race-home', 'apps/race-home/docs/promo/race-home-promo-en.mp4'],
  ['ladder-run', 'apps/ladder-run/docs/promo/ladder-run-promo-en.mp4'],
  ['pair-up', 'apps/pair-up/docs/promo/pair-up-promo-en.mp4'],
  ['domino-line', 'apps/domino-line/docs/promo/domino-line-promo-en.mp4'],
  ['color-chain', 'apps/color-chain/docs/promo/color-chain-promo-en.mp4'],
  ['five-dice', 'apps/five-dice/docs/promo/five-dice-promo-en.mp4'],
  ['fleet', 'apps/fleet/docs/promo/fleet-promo-en.mp4'],
  ['codebreak', 'apps/codebreak/docs/promo/codebreak-promo-en.mp4'],
  ['triple-find', 'apps/triple-find/docs/promo/triple-find-promo-en.mp4'],
  ['little-go', 'apps/little-go/docs/promo/little-go-promo-en.mp4'],
  ['mini-chess', 'apps/mini-chess/docs/promo/mini-chess-promo-en.mp4'],
  ['hex', 'apps/hex/docs/promo/hex-promo-en.mp4'],
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
