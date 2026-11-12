import fs from 'node:fs';
let text = fs.readFileSync('tools/prepare-hub.mjs', 'utf8');
text = text.replace(
  'const games = [];',
  `const timeZhMap = {
  'star-leap': '15–25 分钟',
  'sweet-carousel': '15 分钟',
  'hue-garden': '20–30 分钟',
  'field-and-wall': '30–35 分钟',
  'balloon-rally': '20–25 分钟',
  blokus: '20–30 分钟',
  splendor: '30 分钟',
};
const games = [];`,
);
text = text.replace('  let data;\n  const manifest', "  let data;\n  let timeZh = '';\n  const manifest");
text = text.replace(
  "    data = [v.title, v.titleZh, v.tagline, v.taglineZh, v.players.replace(' players', ''), v.time, v.age, 'arcade', v.accent];",
  "    data = [v.title, v.titleZh, v.tagline, v.taglineZh, v.players.replace(' players', ''), v.time, v.age, 'arcade', v.accent];\n    timeZh = v.timeZh || '';",
);
text = text.replace('    data = extra[slug];', "    data = extra[slug];\n    timeZh = timeZhMap[slug] || '';");
text = text.replace('    time,\n    age,', '    time,\n    timeZh: timeZh || time,\n    age,');
fs.writeFileSync('tools/prepare-hub.mjs', text);
console.log('timeZh added');
