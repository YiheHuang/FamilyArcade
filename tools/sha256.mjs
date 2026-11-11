import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const releases = path.join(root, 'releases');
const lines = [];
for (const slug of readdirSync(releases)) {
  const dir = path.join(releases, slug);
  if (!statSync(dir).isDirectory()) continue;
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.exe'))) {
    const full = path.join(dir, file);
    const hash = createHash('sha256').update(readFileSync(full)).digest('hex');
    lines.push(`${hash}  releases/${slug}/${file}`);
  }
}
lines.sort();
writeFileSync(path.join(releases, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
console.log(`hashed ${lines.length} installers`);
