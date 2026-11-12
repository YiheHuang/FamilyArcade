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
  const existingDir = path.join(releases, slug);
  const already = existsSync(existingDir)
    ? readdirSync(existingDir).find((file) => file.endsWith('.exe'))
    : null;
  const keepExisting = slug !== 'family-arcade' && already;
  if (keepExisting) {
    manifest.push({
      slug,
      name: conf.productName,
      version: conf.version,
      file: `releases/${slug}/${already}`,
      bytes: statSync(path.join(existingDir, already)).size,
    });
    continue;
  }
  if (!existsSync(candidate)) {
    if (already) {
      manifest.push({
        slug,
        name: conf.productName,
        version: conf.version,
        file: `releases/${slug}/${already}`,
        bytes: statSync(path.join(existingDir, already)).size,
      });
    } else {
      console.warn(`missing ${slug}: ${expected}`);
    }
    continue;
  }
  mkdirSync(existingDir, { recursive: true });
  const file = slug === 'family-arcade'
    ? `FamilyArcade_${conf.version}_x64-setup.exe`
    : `${slug}_${conf.version}_x64-setup.exe`;
  copyFileSync(candidate, path.join(existingDir, file));
  manifest.push({
    slug,
    name: conf.productName,
    version: conf.version,
    file: `releases/${slug}/${file}`,
    bytes: statSync(path.join(existingDir, file)).size,
  });
}

writeFileSync(path.join(releases, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`collected ${manifest.length} installers`);
for (const item of manifest) console.log(`${item.slug}: ${(item.bytes / 1048576).toFixed(2)} MiB`);
