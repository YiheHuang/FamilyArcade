#!/usr/bin/env node
/**
 * Run the local verification gate for every app.
 *   node tools/check-all.mjs            # npm run check for every app
 *   node tools/check-all.mjs --e2e      # also run e2e (needs each dev server)
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(',').map((slug) => slug.trim()).filter(Boolean)) : null;
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
  'gomoku',
  'xiangqi',
  'chess',
  'go',
  'shogi',
  'intl-draughts',
  'jungle-chess',
  'hearts',
  'spades',
  'rummy-500',
  'cribbage',
  'abalone',
  'hive',
  'quarto',
  'president',
];

let failed = 0;
const selected = only ? games.filter((slug) => only.has(slug)) : games;
for (const slug of selected) {
  const cwd = path.join(root, 'apps', slug);
  if (!existsSync(cwd)) {
    console.log(`MISSING ${slug}`);
    failed += 1;
    continue;
  }
  const env = { ...process.env };
  if (slug === 'blokus') {
    env.CARGO_TARGET_DIR = existsSync('T:\\') ? 'T:\\target-blokus' : path.join(root, 'target-blokus');
  }
  const check = await new Promise((resolve) => {
    const child = spawn('npm', ['run', 'check'], { cwd, env, shell: true, stdio: 'ignore' });
    child.on('exit', (code) => resolve(code));
  });
  console.log(`${check === 0 ? 'OK  ' : 'FAIL'} ${slug}`);
  if (check !== 0) failed += 1;
}
console.log(`\n${selected.length - failed}/${selected.length} apps green`);
if (failed) process.exit(1);
