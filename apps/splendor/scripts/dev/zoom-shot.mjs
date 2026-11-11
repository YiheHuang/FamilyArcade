// 单元素特写截图：卡牌 / 预定小卡 / 贵族 / 面板
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.SHOT_PORT ?? 5197);
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(ROOT, 'data', 'tmp', 'shots');

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
  await page.goto(`${BASE}/?dev=game&scene=reserved`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const cards = page.locator('button.card-face');
  const n = await cards.count();
  console.log('卡牌元素数量', n);
  // 桌面上的前 6 张大卡
  const boardCards = cards.filter({ hasNot: page.locator('.text-\\[9px\\]') });
  const targets = [
    ['card-0', cards.nth(3)],
    ['card-1', cards.nth(4)],
    ['card-2', cards.nth(5)],
    ['card-mini-0', cards.nth(0)],
    ['card-mini-1', cards.nth(1)],
  ];
  for (const [name, loc] of targets) {
    try {
      await loc.screenshot({ path: path.join(OUT, `zoom-${name}.png`) });
      console.log('📸', name);
    } catch (err) {
      console.log('跳过', name, String(err).slice(0, 80));
    }
  }
  // 一个玩家面板特写
  await page.locator('.surface.flex.min-w-0').first().screenshot({ path: path.join(OUT, 'zoom-panel.png') });
  console.log('📸 zoom-panel');
  // 一张贵族
  await page.locator('.card-face').filter({ hasText: /Charles|Mary|Elisa/ }).first().screenshot({ path: path.join(OUT, 'zoom-noble.png') });
  console.log('📸 zoom-noble');
  void boardCards;
} finally {
  await browser?.close();
  server.kill();
  setTimeout(() => process.exit(0), 300);
}
