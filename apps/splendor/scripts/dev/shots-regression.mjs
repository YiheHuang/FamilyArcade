#!/usr/bin/env node
/**
 * Screenshot regression: fixed viewport, fixed seed, animations off, Chinese UI.
 *
 * Baselines live in `data/baselines/*.png` (committed). The comparison happens
 * inside the browser (canvas) so we need no image-diff dependency; a scene fails
 * when more than 3 % of pixels differ noticeably, which tolerates font
 * anti-aliasing differences between machines while still catching real layout
 * or content regressions.
 *
 * Usage:
 *   node scripts/dev/shots-regression.mjs            # compare
 *   node scripts/dev/shots-regression.mjs --update   # rewrite baselines
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE_DIR = path.join(ROOT, 'data', 'baselines');
const SHOTS = path.join(ROOT, 'data', 'tmp', 'shots');
const PORT = Number(process.env.SHOTS_PORT ?? 5196);
const BASE = `http://localhost:${PORT}`;
const UPDATE = process.argv.includes('--update');
const TOLERANCE = 0.03;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[shots] ${m}`);
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const SCENES = [
  { name: 'menu', url: '/?lang=zh', width: 1440, height: 900 },
  { name: 'library', url: '/?screen=library&lang=zh', width: 1440, height: 900 },
  { name: 'rules', url: '/?screen=rules&lang=zh', width: 1440, height: 900 },
  { name: 'settings', url: '/?screen=settings&lang=zh', width: 1440, height: 1100 },
  { name: 'records-stats', url: '/?dev=records&lang=zh', width: 1440, height: 900, after: 'stats' },
  { name: 'game', url: '/?dev=game&scene=fresh&human=1&seed=shot-seed&lang=zh&turnsecs=0', width: 1440, height: 900 },
  { name: 'mobile-game', url: '/?dev=game&scene=fresh&human=1&seed=shot-seed&lang=zh&turnsecs=0', width: 390, height: 844 },
];

fs.mkdirSync(BASELINE_DIR, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const server = spawn('npm', ['run', 'preview', '-w', '@splendor/client', '--', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});
async function waitReady(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE + '/');
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error('preview 未就绪');
}

let browser = null;
try {
  await waitReady();
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const scene of SCENES) {
    const page = await browser.newPage({ viewport: { width: scene.width, height: scene.height }, deviceScaleFactor: 1 });
    // 固定环境：关动画/音乐/音效、中文、已看过新手引导
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'splendor.settings.v1',
          JSON.stringify({ lang: 'zh', animations: false, animSpeed: 1, music: false, sound: false, uiClicks: false, uiScale: 1 }),
        );
        localStorage.setItem('splendor.tutorial.v1', '1');
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE + scene.url, { waitUntil: 'load' });
    await sleep(1100);
    if (scene.after === 'stats') {
      await page.locator('[data-testid="tab-stats"]').click();
      await sleep(1100);
    }
    const buffer = await page.screenshot();
    await page.close();

    const file = path.join(BASELINE_DIR, `${scene.name}.png`);
    fs.writeFileSync(path.join(SHOTS, `regression-${scene.name}.png`), buffer);
    if (UPDATE || !fs.existsSync(file)) {
      fs.writeFileSync(file, buffer);
      ok(`${scene.name}：已写入基线`, true, `${(buffer.length / 1024).toFixed(0)} KB`);
      continue;
    }

    const baseline = fs.readFileSync(file);
    const page2 = await browser.newPage({ viewport: { width: scene.width, height: scene.height }, deviceScaleFactor: 1 });
    const diff = await page2.evaluate(
      async ({ a, b }) => {
        const load = (src) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
          });
        const [A, B] = await Promise.all([load(a), load(b)]);
        if (A.width !== B.width || A.height !== B.height) {
          return { sizeMismatch: `${A.width}x${A.height} vs ${B.width}x${B.height}` };
        }
        // 降采样到 1/3 再比较：抹平不同机器上的字体抗锯齿差异，
        // 同时保留"布局/内容变化"这类真实回归（局部变化占比依旧明显）。
        const scale = 3;
        const w = Math.max(1, Math.floor(A.width / scale));
        const h = Math.max(1, Math.floor(A.height / scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(A, 0, 0, w, h);
        const da = ctx.getImageData(0, 0, w, h).data;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(B, 0, 0, w, h);
        const db = ctx.getImageData(0, 0, w, h).data;
        let differing = 0;
        for (let i = 0; i < da.length; i += 4) {
          if (
            Math.abs(da[i] - db[i]) > 12 ||
            Math.abs(da[i + 1] - db[i + 1]) > 12 ||
            Math.abs(da[i + 2] - db[i + 2]) > 12
          ) {
            differing += 1;
          }
        }
        return { ratio: differing / (da.length / 4), scale: 1 / scale };
      },
      { a: `data:image/png;base64,${buffer.toString('base64')}`, b: `data:image/png;base64,${baseline.toString('base64')}` },
    );
    await page2.close();

    if (diff.sizeMismatch) {
      ok(`${scene.name}：尺寸与基线一致`, false, diff.sizeMismatch);
    } else {
      const pct = (diff.ratio * 100).toFixed(2);
      ok(`${scene.name}：与基线一致（容差 ${(TOLERANCE * 100).toFixed(0)}%）`, diff.ratio <= TOLERANCE, `差异 ${pct}%`);
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  if (UPDATE) log('基线已更新（记得提交 data/baselines/）');
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (err) {
  log(`出错：${String(err).slice(0, 300)}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  server.kill();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}
