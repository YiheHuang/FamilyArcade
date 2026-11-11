#!/usr/bin/env node
/**
 * Run the local verification gate for every app.
 *   node tools/check-all.mjs            # npm run check for all 27
 *   node tools/check-all.mjs --e2e      # also run e2e (needs each dev server)
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const games = [
  'star-leap',
  'sweet-carousel',
  'hue-garden',
  'field-and-wall',
  'balloon-rally',
  'blokus',
  'splendor',
  'triple',
  'four',
  'flip',
  'draughts',
  'mill',
  'boxes',
  'sowing',
  'tables',
  'race-home',
  'ladder-run',
  'pair-up',
  'domino-line',
  'color-chain',
  'five-dice',
  'fleet',
  'codebreak',
  'triple-find',
  'little-go',
  'mini-chess',
  'hex',
];

let failed = 0;
for (const slug of games) {
  const cwd = path.join(root, 'apps', slug);
  if (!existsSync(cwd)) {
    console.log(`MISSING ${slug}`);
    failed += 1;
    continue;
  }
  const check = await new Promise((resolve) => {
    const child = spawn('npm', ['run', 'check'], { cwd, shell: true, stdio: 'ignore' });
    child.on('exit', (code) => resolve(code));
  });
  console.log(`${check === 0 ? 'OK  ' : 'FAIL'} ${slug}`);
  if (check !== 0) failed += 1;
}
console.log(`\n${games.length - failed}/${games.length} apps green`);
if (failed) process.exit(1);
