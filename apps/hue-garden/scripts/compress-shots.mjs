import sharp from 'sharp';
import { readdir, stat, rename } from 'node:fs/promises';
import path from 'node:path';
for (const lang of ['en','zh']) {
  const dir = path.join('docs','screenshots',lang);
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.png')) continue;
    const input = path.join(dir,file);
    const tmp = input + '.tmp.png';
    await sharp(input).png({ compressionLevel: 9, palette: true, quality: 82, effort: 8 }).toFile(tmp);
    const before=(await stat(input)).size; const after=(await stat(tmp)).size;
    await rename(tmp,input);
    console.log(lang,file,Math.round(before/1024)+'KB ->',Math.round(after/1024)+'KB');
  }
}
