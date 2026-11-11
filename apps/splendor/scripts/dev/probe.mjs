// 布局探针：量出关键元素的尺寸与间距，便于精确调参
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.SHOT_PORT ?? 5198);
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
  for (const vp of [
    { name: '1440x900', width: 1440, height: 900 },
    { name: '1366x768', width: 1366, height: 768 },
  ]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`${BASE}/?dev=game&scene=default`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const data = await page.evaluate(() => {
      const out = { sections: [], cards: [], panels: [] };
      const q = (sel) => document.querySelector(sel);
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const root = q('#root > div');
      const kids = root ? [...root.children] : [];
      for (const k of kids) {
        const r = rect(k);
        if (r) out.sections.push({ cls: k.className.slice(0, 60), top: Math.round(r.top), h: Math.round(r.height) });
      }
      // 卡牌尺寸与水平间距
      const cards = [...document.querySelectorAll('button')].filter((b) => (b.className || '').includes('card-face'));
      const boardCards = cards.slice(0, 12).map((c) => {
        const r = rect(c);
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      });
      out.cards = boardCards;
      // 玩家面板
      const panels = [...document.querySelectorAll('.surface')].filter((el) => (el.className || '').includes('flex-col'));
      out.panels = panels.slice(0, 4).map((p) => {
        const r = rect(p);
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      out.scroll = { h: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight };
      return out;
    });
    console.log(`\n=== ${vp.name} ===`);
    console.log('区块高度:', data.sections.map((s) => `${s.h}px`).join(' / '));
    console.log('滚动:', data.scroll.h, '/', data.scroll.ch);
    console.log('面板:', JSON.stringify(data.panels));
    const ys = data.cards.slice(0, 5);
    if (ys.length >= 2) {
      console.log('卡牌:', JSON.stringify(ys[0]), '→ 横向 pitch:', ys[1].x - ys[0].x, '纵向 pitch:', Math.abs((data.cards[4]?.y ?? 0) - (data.cards[0]?.y ?? 0)));
    }
    console.log('卡牌列表:', JSON.stringify(data.cards.slice(0, 9)));
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
  setTimeout(() => process.exit(0), 300);
}
