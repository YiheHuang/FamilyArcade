#!/usr/bin/env node
/**
 * Build one lightweight NSIS installer per game, sharing Cargo artifacts.
 * Run from the repo root with T: mapped to the repo to avoid windres path-space
 * issues on the GNU toolchain:
 *
 *   subst T: C:\Users\...\FamilyArcade
 *   node tools/build-releases.mjs
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const drive = existsSync('T:\\') ? 'T:\\' : root;
const target = path.join(drive, 'target');
const releases = path.join(root, 'releases');
mkdirSync(releases, { recursive: true });

const apps = readdirSync(path.join(root, 'apps')).filter((slug) =>
  existsSync(path.join(root, 'apps', slug, 'package.json')),
);

function tauriDir(slug) {
  if (slug === 'splendor') return path.join(drive, 'apps', 'splendor', 'packages', 'desktop');
  return path.join(drive, 'apps', slug);
}

const results = [];
for (const slug of apps) {
  if (slug === 'family-arcade') continue;
  const existing = path.join(releases, slug);
  if (existsSync(existing) && readdirSync(existing).some((file) => file.endsWith('.exe'))) {
    console.log(`skip ${slug}: installer already present`);
    continue;
  }
  const cwd = tauriDir(slug);
  const confPath = slug === 'splendor'
    ? path.join(root, 'apps', 'splendor', 'packages', 'desktop', 'src-tauri', 'tauri.conf.json')
    : path.join(root, 'apps', slug, 'src-tauri', 'tauri.conf.json');
  if (!existsSync(confPath)) {
    console.log(`skip ${slug}: no tauri.conf.json`);
    continue;
  }
  const conf = JSON.parse(readFileSync(confPath, 'utf8'));
  console.log(`\n=== ${slug} · ${conf.productName} ${conf.version} ===`);
  let output = '';
  let ok = false;
  const cliCandidates = [
    path.join(cwd, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    path.join(root, 'apps', slug, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
  ];
  const cli = cliCandidates.find((item) => existsSync(item));
  if (!cli) {
    console.error(`FAIL ${slug}: Tauri CLI not installed`);
    results.push({ slug, ok: false });
    continue;
  }
  try {
    output = execFileSync(process.execPath, [cli, 'build', '--bundles', 'nsis'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CARGO_TARGET_DIR: target },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60 * 60 * 1000,
    });
    ok = true;
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  const expected = path.join(target, 'release', 'bundle', 'nsis', `${conf.productName}_${conf.version}_x64-setup.exe`);
  const bundle = existsSync(expected) ? expected : output.match(/Finished 1 bundle at:\s*([^\r\n]+)/)?.[1]?.trim();
  writeFileSync(path.join(root, 'releases', `${slug}-build.log`), output);
  if (!bundle || !existsSync(bundle)) {
    console.error(`FAIL ${slug}`);
    results.push({ slug, ok: false });
    continue;
  }
  mkdirSync(path.join(releases, slug), { recursive: true });
  const name = `${slug}_${conf.version}_x64-setup.exe`;
  const dest = path.join(releases, slug, name);
  copyFileSync(bundle, dest);
  const size = statSync(dest).size;
  console.log(`OK ${slug}: ${(size / 1048576).toFixed(2)} MiB -> releases/${slug}/${name}`);
  results.push({ slug, ok: true, name, size });
}

writeFileSync(path.join(releases, 'manifest.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(`\nbuilt ${results.filter((r) => r.ok).length}/${results.length}`);
