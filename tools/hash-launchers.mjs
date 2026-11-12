#!/usr/bin/env node
/** Hash the three Family Arcade 3.0 launchers and write the launcher manifest. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  ['offline', 'FamilyArcade_3.0.0_x64-setup.exe', 'Full installer with the WebView2 runtime and all games'],
  ['slim', 'FamilyArcade_3.0.0_slim_x64-setup.exe', 'All games, no bundled runtime; WebView2 bootstrapper'],
  ['lite', 'FamilyArcade_Lite_3.0.0_x64-setup.exe', 'Launcher only; downloads games on demand'],
];

const launchers = [];
for (const [id, name, description] of files) {
  const file = path.join(root, 'releases', 'family-arcade', name);
  if (!existsSync(file)) {
    console.warn(`missing ${name}`);
    continue;
  }
  const bytes = statSync(file).size;
  const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  launchers.push({
    id,
    name,
    file: `releases/family-arcade/${name}`,
    bytes,
    sha256,
    description,
  });
  console.log(`${id}: ${(bytes / 1024 / 1024).toFixed(2)} MB ${sha256}`);
}

writeFileSync(
  path.join(root, 'releases', 'launchers.json'),
  `${JSON.stringify({ version: '3.0.0', release: 'family-arcade-v3.0.0', packagesTag: 'game-packages-v3.0.0', launchers }, null, 2)}\n`,
);
writeFileSync(
  path.join(root, 'releases', 'launchers-SHA256SUMS.txt'),
  `${launchers.map((item) => `${item.sha256}  ${item.file}`).join('\n')}\n`,
);
