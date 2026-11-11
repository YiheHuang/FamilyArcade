import fs from 'node:fs';
import path from 'node:path';

let changed = 0;
for (const slug of fs.readdirSync('apps')) {
  const file = path.join('apps', slug, 'src-tauri', 'src', 'main.rs');
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const next = text.replaceAll('familyarcade_lan_host', 'family_arcade_lan_host');
  if (next !== text) {
    fs.writeFileSync(file, next);
    changed += 1;
  }
}
console.log('fixed', changed, 'main.rs files');
