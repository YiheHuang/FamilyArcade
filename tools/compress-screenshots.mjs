#!/usr/bin/env node
/** Convert docs screenshots to high-quality JPEG and update markdown links. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const jobs = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'target') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.png') && full.replaceAll('\\', '/').includes('/docs/screenshots/')) {
      jobs.push(full);
    }
  }
}
walk(path.join(root, 'apps'));

let index = 0;
async function worker() {
  while (index < jobs.length) {
    const png = jobs[index++];
    const jpg = png.replace(/\.png$/, '.jpg');
    try {
      execFileSync('ffmpeg', ['-y', '-i', png, '-q:v', '3', jpg], { stdio: 'ignore' });
      unlinkSync(png);
    } catch (error) {
      console.error('failed', png, String(error));
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker(), worker(), worker(), worker(), worker()]);
console.log(`converted ${jobs.length} screenshots`);

function* markdownFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', 'target', '.git'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* markdownFiles(full);
    else if (entry.endsWith('.md')) yield full;
  }
}

let changed = 0;
for (const file of markdownFiles(root)) {
  let text = readFileSync(file, 'utf8');
  const next = text.replace(/(docs\/screenshots\/[^)\s]+)\.png/g, '$1.jpg');
  if (next !== text) {
    writeFileSync(file, next);
    changed += 1;
  }
}
console.log(`updated ${changed} markdown files`);
