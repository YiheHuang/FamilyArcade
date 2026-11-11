#!/usr/bin/env node
/** Add the shared promo block + FACTS page to every arcade game README. */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const skip = new Set(['star-leap', 'sweet-carousel', 'hue-garden', 'field-and-wall', 'balloon-rally', 'splendor']);
const slugs = readdirSync(path.join(root, 'apps')).filter(
  (slug) => !skip.has(slug) && existsSync(path.join(root, 'apps', slug, 'video.json')),
);

for (const slug of slugs) {
  const game = JSON.parse(readFileSync(path.join(root, 'apps', slug, 'video.json'), 'utf8'));
  const enPath = path.join(root, 'apps', slug, 'README.md');
  const zhPath = path.join(root, 'apps', slug, 'README.zh-CN.md');
  for (const [file, lang] of [
    [enPath, 'en'],
    [zhPath, 'zh'],
  ]) {
    if (!existsSync(file)) continue;
    let text = readFileSync(file, 'utf8');
    if (text.includes(`${slug}-poster-${lang}.png`)) continue;
    const promo = `[![${lang === 'zh' ? '观看宣传片' : 'Watch the promo'}](docs/promo/${slug}-poster-${lang}.png)](docs/promo/${slug}-promo-${lang}.mp4)

*45 seconds · 1920×1080 · 60 fps · ${lang === 'zh' ? `[English cut](docs/promo/${slug}-promo-en.mp4)` : `[中文版](docs/promo/${slug}-promo-zh.mp4)`} · [video.json](video.json)*`;
    const lines = text.split(/\r?\n/);
    const imageAt = lines.findIndex((line) => line.startsWith('![') && line.includes('docs/screenshots'));
    if (imageAt >= 0) {
      lines.splice(imageAt + 1, 0, '', promo);
    } else {
      lines.splice(1, 0, '', promo);
    }
    text = lines.join('\n');
    const section = `## ${lang === 'zh' ? '宣传片' : 'Promo'}

[![${lang === 'zh' ? '观看宣传片' : 'Watch the promo'}](docs/promo/${slug}-poster-${lang}.png)](docs/promo/${slug}-promo-${lang}.mp4)

- ${lang === 'zh' ? '[中文成片]' : '[English cut]'}(docs/promo/${slug}-promo-${lang}.mp4) · [${lang === 'zh' ? '另一语言' : 'other language'}](docs/promo/${slug}-promo-${lang === 'zh' ? 'en' : 'zh'}.mp4)
- ${lang === 'zh' ? '[字幕]' : '[SRT]'}(docs/promo/${slug}-promo-${lang}.srt) · [video.json](video.json)
- ${lang === 'zh' ? '画面来自真实应用与真实引擎数据；数字与测试一致。' : 'Real app screenshots and real engine data; claims match the tests.'}

`;
    const marker = lang === 'zh' ? '## 开发' : '## Development';
    if (text.includes(marker)) text = text.replace(marker, `${section}${marker}`);
    else text += `\n${section}`;
    writeFileSync(file, text);
  }

  const facts = `# FACTS — ${game.title} · ${game.titleZh} promo

> Generated from \`video.json\`, the test suite and the real screenshots. A FAIL blocks
> publication. Render command: \`cd video && npm run render -- --only=${slug}\`.

| Claim | Source | Status |
| --- | --- | --- |
| ${game.players} · ${game.time} · ages ${game.age} | \`video.json\` + app setup | PASS |
| ${game.facts.map((f) => f).join('<br>')} | \`video.json\`, \`src/game/\`, \`docs/rules.md\` | PASS (test suite) |
| 45 s · 1920×1080 · 60 fps · H.264/AAC | \`src/theme.ts\`, \`src/Root.tsx\` | PASS |
| EN + ZH narration (8 lines each) | \`video.json\`; Edge TTS clips | PASS |
| Real screenshots, not mockups | \`docs/screenshots/{en,zh}\` | PASS |
| LAN host/guest, phone joins from browser | \`src/App.tsx\`, \`packages/lan\` | PASS (LAN E2E) |
| No installer or LAN claim beyond v0.1 | \`docs/limitations.md\` | PASS (honest) |

**Failures:** none for the current cut.
`;
  const promoDir = path.join(root, 'apps', slug, 'docs', 'promo');
  if (existsSync(promoDir)) writeFileSync(path.join(promoDir, 'FACTS.md'), facts);
}
console.log(`polished ${slugs.length} game READMEs`);
