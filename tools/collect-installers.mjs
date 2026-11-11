#!/usr/bin/env node
/** Copy every successfully built NSIS installer from the shared target directory. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const bundleDir = existsSync('T:\\target\\release\\bundle\\nsis')
  ? 'T:\\target\\release\\bundle\\nsis'
  : path.join(root, 'target', 'release', 'bundle', 'nsis');
const releases = path.join(root, 'releases');
mkdirSync(releases, { recursive: true });
const manifest = [];

for (const slug of readdirSync(path.join(root, 'apps'))) {
  const confPath =
    slug === 'splendor'
      ? path.join(root, 'apps', slug, 'packages', 'desktop', 'src-tauri', 'tauri.conf.json')
      : path.join(root, 'apps', slug, 'src-tauri', 'tauri.conf.json');
  if (!existsSync(confPath)) continue;
  const conf = JSON.parse(readFileSync(confPath, 'utf8'));
  const expected = `${conf.productName}_${conf.version}_x64-setup.exe`;
  const candidate = path.join(bundleDir, expected);
  if (!existsSync(candidate)) {
    const existing = path.join(releases, slug);
    const already = existsSync(existing)
      ? readdirSync(existing).find((file) => file.endsWith('.exe'))
      : null;
    if (already) {
      manifest.push({
        slug,
        name: conf.productName,
        version: conf.version,
        file: `releases/${slug}/${already}`,
        bytes: statSync(path.join(existing, already)).size,
      });
    } else {
      console.warn(`missing ${slug}: ${expected}`);
    }
    continue;
  }
  mkdirSync(path.join(releases, slug), { recursive: true });
  const file = `${slug}_${conf.version}_x64-setup.exe`;
  copyFileSync(candidate, path.join(releases, slug, file));
  manifest.push({
    slug,
    name: conf.productName,
    version: conf.version,
    file: `releases/${slug}/${file}`,
    bytes: statSync(path.join(releases, slug, file)).size,
  });
}

writeFileSync(path.join(releases, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`collected ${manifest.length} installers`);
for (const item of manifest) console.log(`${item.slug}: ${(item.bytes / 1048576).toFixed(2)} MiB`);
