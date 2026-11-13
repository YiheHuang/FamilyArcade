#!/usr/bin/env node
/** Build portable ZIP packages for the download-on-demand launcher. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const hub = path.join(root, 'apps', 'family-arcade');
const games = JSON.parse(readFileSync(path.join(hub, 'src', 'data', 'games.json'), 'utf8'));
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
const only = onlyArg ? new Set(onlyArg.split(',').map((slug) => slug.trim()).filter(Boolean)) : null;
const tag = process.env.PACKAGE_TAG || 'game-packages-v3.1.0';
const outDir = path.join(root, 'releases', 'packages');
mkdirSync(outDir, { recursive: true });

const catalogPath = path.join(outDir, 'packages.json');
const previous = existsSync(catalogPath)
  ? JSON.parse(readFileSync(catalogPath, 'utf8'))
  : { repo: 'YiheHuang/FamilyArcade', tag, games: {} };

const entries = { ...previous.games };
let built = 0;
for (const game of games) {
  if (only && !only.has(game.slug)) continue;
  const source = path.join(hub, 'games', game.slug);
  if (!existsSync(path.join(source, 'game.exe'))) {
    console.warn(`skip ${game.slug}: no portable game.exe`);
    continue;
  }
  const zip = path.join(outDir, `${game.slug}.zip`);
  rmSync(zip, { force: true });
  execFileSync('tar', ['-a', '-cf', zip, '-C', source, '.'], { stdio: 'ignore' });
  const bytes = statSync(zip).size;
  const sha256 = createHash('sha256').update(readFileSync(zip)).digest('hex');
  entries[game.slug] = { asset: `${game.slug}.zip`, bytes, sha256 };
  console.log(`${game.slug}: ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  built += 1;
}

const catalog = {
  repo: 'YiheHuang/FamilyArcade',
  tag,
  generated: new Date().toISOString(),
  games: entries,
};
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
writeFileSync(
  path.join(hub, 'src', 'data', 'packages.json'),
  `${JSON.stringify(catalog, null, 2)}\n`,
);
console.log(`packages: ${built} built, ${Object.keys(entries).length} catalogued`);
