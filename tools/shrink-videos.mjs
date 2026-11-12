#!/usr/bin/env node
/** Shrink committed promo MP4s without changing resolution/fps/audio. */
import { execFileSync } from 'node:child_process';
import { readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(',').map((slug) => slug.trim()).filter(Boolean)) : null;
const files = [];
for (const slug of readdirSync(path.join(root, 'apps'))) {
  if (only && !only.has(slug)) continue;
  const dir = path.join(root, 'apps', slug, 'docs', 'promo');
  try {
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.mp4')) files.push(path.join(dir, file));
    }
  } catch {
    /* no promo */
  }
}
let index = 0;
async function worker() {
  while (index < files.length) {
    const input = files[index++];
    const temp = input.replace(/\.mp4$/, '.small.mp4');
    try {
      execFileSync(
        'ffmpeg',
        ['-y', '-i', input, '-c:v', 'libx264', '-crf', '24', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', temp],
        { stdio: 'ignore' },
      );
      renameSync(temp, input);
      console.log(`${path.basename(input)} ${(statSync(input).size / 1048576).toFixed(1)} MB`);
    } catch (error) {
      console.error('failed', input, String(error));
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`re-encoded ${files.length} promos`);
