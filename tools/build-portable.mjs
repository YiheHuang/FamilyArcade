#!/usr/bin/env node
/** Build portable Tauri binaries for the next 11 games, without NSIS installers. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const drive = existsSync('T:\\') ? 'T:\\' : root;
const target = path.join(drive, 'target');
const releases = path.join(root, 'releases');
mkdirSync(releases, { recursive: true });

const ALL_GAMES = [
  'doudizhu',
  'texas-holdem',
  'zheng-shangyou',
  'jokers-table',
  'guandan',
  'mahjong',
  'big-two',
  'sheng-ji',
  'liars-dice',
  'idiom-chain',
  'nanchang-mahjong',
];
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(',').map((slug) => slug.trim()).filter(Boolean)) : null;
const games = only ? ALL_GAMES.filter((slug) => only.has(slug)) : ALL_GAMES;

for (const slug of games) {
  const cwd = path.join(drive, 'apps', slug);
  if (!existsSync(cwd)) {
    console.log(`missing ${slug}`);
    continue;
  }
  const cli = path.join(cwd, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  if (!existsSync(cli)) {
    console.log(`missing Tauri CLI for ${slug}`);
    continue;
  }
  console.log(`=== ${slug} ===`);
  let output = '';
  try {
    output = execFileSync(process.execPath, [cli, 'build', '--no-bundle'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CARGO_TARGET_DIR: target },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60 * 60 * 1000,
    });
    writeFileSync(path.join(releases, `${slug}-portable.log`), output);
    console.log(`built ${slug}`);
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    writeFileSync(path.join(releases, `${slug}-portable.log`), output);
    console.error(`FAIL ${slug}`);
  }
}
console.log('portable build pass done; run node tools/prepare-hub.mjs');
