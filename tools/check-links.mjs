#!/usr/bin/env node
/** Check relative links and image paths in every markdown file. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let missing = 0;
let checked = 0;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', 'target', 'out', '.git', 'releases'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (entry.endsWith('.md')) files.push(full);
  }
  return files;
}

for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(text))) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('http') || raw.startsWith('mailto:')) continue;
    const target = raw.split('#')[0].split('?')[0];
    if (!target) continue;
    checked += 1;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    if (!existsSync(resolved)) {
      console.log(`MISSING ${path.relative(root, file)} -> ${raw}`);
      missing += 1;
    }
  }
}
console.log(`checked ${checked} relative links; missing ${missing}`);
if (missing) process.exit(1);
