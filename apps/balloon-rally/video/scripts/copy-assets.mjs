import { cpSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const files = ['home.png', 'game.png', 'game-select.png', 'game-mobile.png', 'stats.png', 'setup.png'];

for (const lang of ['en', 'zh']) {
  const out = path.resolve(import.meta.dirname, '..', 'public', 'shots', lang);
  mkdirSync(out, { recursive: true });
  for (const file of files) {
    cpSync(path.join(root, 'docs', 'screenshots', lang, file), path.join(out, file));
  }
}
console.log('shots copied to video/public/shots');
