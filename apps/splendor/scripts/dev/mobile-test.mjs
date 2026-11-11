#!/usr/bin/env node
/**
 * 手机 / 平板布局自检：三个视口下真实操作一遍主流程，检查零横向滚动、可点性与气泡位置。
 * 用法：node scripts/dev/mobile-test.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.MOBILE_PORT ?? 5197);
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const VIEWPORTS = [
  { name: 'iphone-se', width: 375, height: 667 },
  { name: 'iphone-landscape', width: 844, height: 390 },
  { name: 'ipad', width: 768, height: 1024 },
];

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('npm', ['run', 'preview', '-w', '@splendor/client', '--', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});

async function waitReady(timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE + '/');
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  throw new Error('preview 未就绪');
}

let browser;
try {
  await waitReady();
  browser = await chromium.launch({ channel: 'msedge', headless: true });

  for (const vp of VIEWPORTS) {
    console.log(`\n===== ${vp.name}（${vp.width}×${vp.height}） =====`);
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(BASE + '/?dev=game&scene=fresh&human=1&lang=zh', { waitUntil: 'load' });
    await sleep(1000);

    const layout = await page.evaluate(() => {
      const pile = document.querySelector('[data-testid="gem-pile"]');
      const rect = pile?.getBoundingClientRect();
      return {
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        pileW: rect ? Math.round(rect.width) : 0,
        pileH: rect ? Math.round(rect.height) : 0,
        cards: document.querySelectorAll('[data-testid="board-card"]').length,
        nobles: document.querySelectorAll('[data-testid="noble-tile"]').length,
      };
    });
    ok(`${vp.name}：零横向滚动`, layout.scrollW <= layout.clientW + 2, `${layout.scrollW}/${layout.clientW}`);
    ok(`${vp.name}：牌桌与贵族完整渲染`, layout.cards >= 9 && layout.nobles >= 3, `卡 ${layout.cards} · 贵族 ${layout.nobles}`);
    ok(`${vp.name}：宝石堆触控目标 ≥ 40px`, layout.pileW >= 40 && layout.pileH >= 40, `${layout.pileW}×${layout.pileH}`);

    // 1) 点卡片 → 气泡 / 底部抽屉必须在视口内（此刻轮到本方）
    await page.locator('[data-testid="board-card"]').first().click();
    await sleep(600);
    const pop = await page.evaluate(() => {
      const panel = [...document.querySelectorAll('div')].find(
        (d) => String(d.className).includes('fixed') && d.textContent && d.textContent.includes('关闭'),
      );
      if (!panel) return { found: false, box: '未找到' };
      const r = panel.getBoundingClientRect();
      return {
        found: true,
        inside: r.left >= -2 && r.right <= window.innerWidth + 2 && r.top >= -2 && r.bottom <= window.innerHeight + 2,
        box: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`,
      };
    });
    ok(`${vp.name}：操作气泡完全在视口内`, pop.found && pop.inside, pop.box);
    await page.keyboard.press('Escape');
    await sleep(300);

    // 2) 拿 3 枚宝石 → 确认
    await page.locator('[data-gem="white"]').click();
    await page.locator('[data-gem="blue"]').click();
    await page.locator('[data-gem="green"]').click();
    await page.getByText('确认拿取').click();
    await sleep(1400);
    const afterTake = await page.evaluate(() => {
      const count = document.querySelector('[data-testid="panel-token-count-0"]')?.textContent?.trim() ?? '';
      return {
        count,
        ok: /\d+\/10/.test(count),
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      };
    });
    ok(`${vp.name}：拿宝石流程可用（面板计数 x/10）`, afterTake.ok, afterTake.count);
    ok(`${vp.name}：操作后仍零横向滚动`, afterTake.scrollW <= afterTake.clientW + 2, `${afterTake.scrollW}/${afterTake.clientW}`);

    mkdirSync(path.join(ROOT, 'data', 'tmp', 'shots'), { recursive: true });
    await page.screenshot({ path: path.join(ROOT, 'data', 'tmp', 'shots', `mobile-${vp.name}.png`), fullPage: true });

    // 设置页在手机/平板上同样零横向滚动（含缩放一栏）
    await page.goto(BASE + '/?screen=settings&lang=zh', { waitUntil: 'load' });
    await sleep(700);
    const settingsLayout = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scrollW: doc.scrollWidth,
        clientW: doc.clientWidth,
        hasZoom: [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === '130%'),
      };
    });
    ok(`${vp.name}：设置页零横向滚动（含缩放一栏）`, settingsLayout.scrollW <= settingsLayout.clientW + 2 && settingsLayout.hasZoom, `${settingsLayout.scrollW}/${settingsLayout.clientW}`);
    await page.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) {
    for (const f of failed) console.log(`  ❌ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  server.kill();
  setTimeout(() => process.exit(process.exitCode ?? 0), 300);
}
