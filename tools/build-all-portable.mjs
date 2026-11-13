#!/usr/bin/env node
/** Rebuild portable Tauri binaries for every game and copy them into the Hub. */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appsRoot = path.join(root, 'apps');
const hubGames = path.join(appsRoot, 'family-arcade', 'games');
const loader = path.join(root, 'packages', 'runtime', 'WebView2Loader.dll');
const drive = existsSync('T:\\') ? 'T:\\' : root;
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(',').map((slug) => slug.trim()).filter(Boolean)) : null;

const games = readdirSync(appsRoot).filter((slug) => {
  if (slug === 'family-arcade') return false;
  if (only && !only.has(slug)) return false;
  return existsSync(path.join(appsRoot, slug, 'package.json'));
});

for (const slug of games) {
  const app = path.join(appsRoot, slug);
  const isSplendor = slug === 'splendor';
  const cwd = isSplendor ? path.join(app, 'packages', 'desktop') : app;
  const cargoToml = isSplendor
    ? path.join(cwd, 'src-tauri', 'Cargo.toml')
    : path.join(app, 'src-tauri', 'Cargo.toml');
  if (!existsSync(cargoToml)) {
    console.log(`skip ${slug}: no Cargo.toml`);
    continue;
  }
  const target = slug === 'blokus'
    ? path.join(drive, 'target-blokus')
    : isSplendor
      ? path.join(drive, 'target-splendor')
      : path.join(drive, 'target');
  const cliCandidates = [
    path.join(cwd, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    path.join(app, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
  ];
  const cli = cliCandidates.find((candidate) => existsSync(candidate));
  if (!cli) {
    console.log(`skip ${slug}: no Tauri CLI`);
    continue;
  }
  console.log(`=== ${slug} ===`);
  try {
    execFileSync(process.execPath, [cli, 'build', '--no-bundle'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CARGO_TARGET_DIR: target },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60 * 60 * 1000,
    });
  } catch (error) {
    const text = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    writeFileSync(path.join(root, 'releases', `${slug}-portable.log`), text);
    console.error(`FAIL ${slug} (see releases/${slug}-portable.log)`);
    continue;
  }
  const toml = readFileSync(cargoToml, 'utf8');
  const name = toml.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
  const exe = name ? path.join(target, 'release', `${name}.exe`) : null;
  if (!exe || !existsSync(exe)) {
    console.error(`FAIL ${slug}: missing binary ${exe}`);
    continue;
  }
  const dest = path.join(hubGames, slug);
  mkdirSync(dest, { recursive: true });
  copyFileSync(exe, path.join(dest, 'game.exe'));
  if (existsSync(loader)) copyFileSync(loader, path.join(dest, 'WebView2Loader.dll'));
  console.log(`OK ${slug}`);
}
console.log('portable refresh done; run node tools/prepare-hub.mjs');
