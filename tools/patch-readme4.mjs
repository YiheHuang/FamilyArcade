import fs from 'node:fs';
let text = fs.readFileSync('tools/build-readme.mjs', 'utf8');
text = text.replace(
  '*37-second tour · every clip is real gameplay · [full videos below](#the-classics--两款经典)*',
  `*37-second tour · every clip is real gameplay · [full videos below](#the-classics--两款经典)*

**All-in-one Windows app:** [Family Arcade 1.0 launcher](https://github.com/YiheHuang/FamilyArcade/releases/download/family-arcade-v1.0.0/FamilyArcade_1.0.0_x64-setup.exe) — every game in one installer. Per-game installers are linked under each card.`,
);
fs.writeFileSync('tools/build-readme.mjs', text);
console.log('hub download added');
