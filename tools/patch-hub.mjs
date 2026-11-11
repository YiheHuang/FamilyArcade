import fs from 'node:fs';
let text = fs.readFileSync('tools/prepare-hub.mjs', 'utf8');
text = text.replace(
  "  const [title, zh, tagline, taglineZh, players, time, age, category, accent] = data;",
  `  const [title, zh, tagline, taglineZh, players, time, age, rawCategory, accent] = data;
  const category = ['blokus', 'splendor'].includes(slug)
    ? 'classic'
    : ['star-leap', 'sweet-carousel', 'hue-garden', 'field-and-wall', 'balloon-rally'].includes(slug)
      ? 'family'
      : rawCategory;`,
);
fs.writeFileSync('tools/prepare-hub.mjs', text);
console.log('category override added');
