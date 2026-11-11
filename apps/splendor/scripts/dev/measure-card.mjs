// 精确测量：卡牌内部元素（分数徽章 / 成本条 / 缺口徽章）的位置与是否溢出
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.SHOT_PORT ?? 5196);
const BASE = `http://localhost:${PORT}`;

async function waitReady(timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE + '/');
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('preview 未就绪');
}

const server = spawn('npm', ['run', 'preview', '-w', '@splendor/client', '--', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});

let browser;
try {
  await waitReady();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/?dev=game&scene=default`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const data = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('button.card-face')].filter((c) => c.getBoundingClientRect().width > 80);
    const out = [];
    for (const card of cards.slice(0, 4)) {
      const cr = card.getBoundingClientRect();
      const spans = [...card.querySelectorAll('span')];
      const info = spans.map((s) => {
        const r = s.getBoundingClientRect();
        const cs = getComputedStyle(s);
        return {
          text: (s.textContent || '').slice(0, 8),
          pos: cs.position,
          bottom: cs.bottom,
          top: Math.round(r.top - cr.top),
          h: Math.round(r.height),
          w: Math.round(r.width),
          overflowBottom: Math.round(r.bottom - cr.bottom),
          bg: cs.backgroundColor,
        };
      });
      out.push({ card: { w: Math.round(cr.width), h: Math.round(cr.height) }, spans: info });
    }
    return out;
  });
  console.log(JSON.stringify(data, null, 1).slice(0, 4000));
} finally {
  await browser?.close();
  server.kill();
  setTimeout(() => process.exit(0), 300);
}
