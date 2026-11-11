import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const exts = new Set(['.md', '.ts', '.tsx', '.json', '.mjs', '.html', '.css', '.yaml', '.yml', '.toml', '.rs', '.py']);
let changed = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', 'target', '.git', 'out'].includes(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!exts.has(path.extname(entry))) continue;
    const text = readFileSync(full, 'utf8');
    const next = text
      .replaceAll('@family-arcade/', '@family-arcade/')
      .replaceAll('family-arcade-lan-host', 'family-arcade-lan-host')
      .replaceAll('familyarcade', 'familyarcade');
    if (next !== text) {
      writeFileSync(full, next);
      changed += 1;
    }
  }
}

walk(root);
console.log(`renamed internals in ${changed} files`);
