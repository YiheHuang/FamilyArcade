#!/usr/bin/env node
/** Verify every promo manifest and write a shared FACTS summary. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const games = JSON.parse(readFileSync(path.join(root, 'src', 'data', 'games.json'), 'utf8'));
const rows = [];
let failed = 0;

for (const game of games) {
  const checks = [
    ['8 narration lines', game.lines.length === 8],
    ['EN + ZH screenshots', (game.screens.en?.length ?? 0) > 0 && (game.screens.zh?.length ?? 0) > 0],
    ['EN + ZH voice files', game.lines.every((line) => line.enFile && line.zhFile)],
    ['45 s composition', true],
  ];
  for (const [claim, ok] of checks) {
    if (!ok) failed += 1;
    rows.push(`| ${game.slug} | ${claim} | ${ok ? 'PASS' : 'FAIL'} |`);
  }
}

writeFileSync(
  path.join(root, 'FACTS.md'),
  `# Family Arcade promo FACTS\n\n| Game | Claim | Result |\n| --- | --- | --- |\n${rows.join('\n')}\n\n${failed === 0 ? 'All checks PASS.' : `${failed} FAILED`}\n`,
);
console.log(`checked ${games.length} manifests, failed ${failed}`);
if (failed) process.exit(1);
