/**
 * Builds tiny local font subsets (woff2) containing only the glyphs the promo
 * uses — Google Fonts' `text=` API. Keeps CJK payloads at a few hundred KB
 * instead of tens of MB, and renders deterministically offline afterwards.
 *
 * Run: npx tsx scripts/gen-fonts.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { allChars } from "../src/copy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "public", "fonts");
mkdirSync(outDir, { recursive: true });

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function main() {
  const text = allChars();
  const families = [
    { file: "noto-serif-sc-600.woff2", family: "Noto+Serif+SC", weight: 600 },
    { file: "noto-sans-sc-400.woff2", family: "Noto+Sans+SC", weight: 400 },
    { file: "noto-sans-sc-500.woff2", family: "Noto+Sans+SC", weight: 500 },
  ];
  
  console.log(`subsetting ${text.length} characters`);
  
  for (const f of families) {
    const url =
      `https://fonts.googleapis.com/css2?family=${f.family}:wght@${f.weight}` +
      `&display=swap&text=${encodeURIComponent(text)}`;
    const cssRes = await fetch(url, { headers: { "User-Agent": UA } });
    if (!cssRes.ok) throw new Error(`font css failed: ${cssRes.status}`);
    const css = await cssRes.text();
    const match = /url\((https:\/\/[^)]+\.woff2)\)/.exec(css) ?? /url\((https:\/\/[^)]+)\)/.exec(css);
    if (!match) throw new Error(`no font url in css for ${f.file}:\n${css.slice(0, 300)}`);
    const fontRes = await fetch(match[1]!, { headers: { "User-Agent": UA } });
    if (!fontRes.ok) throw new Error(`font download failed: ${fontRes.status}`);
    const bytes = Buffer.from(await fontRes.arrayBuffer());
    writeFileSync(join(outDir, f.file), bytes);
    console.log(`${f.file.padEnd(28)} ${(bytes.length / 1024).toFixed(1)} KB`);
  }
  
  console.log(`written to ${outDir}`);
  
}

main().catch((error) => { console.error(error); process.exit(1); });
