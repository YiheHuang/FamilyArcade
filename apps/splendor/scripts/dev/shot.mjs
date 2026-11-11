#!/usr/bin/env node
/**
 * UI 截图自检：构建产物 + vite preview + Playwright(系统 Edge) 截取各界面与场景。
 *
 * 用法：
 *   node scripts/dev/shot.mjs                      # 全部场景 × 3 种视口
 *   node scripts/dev/shot.mjs game-reserved menu   # 只要指定场景
 *   SHOT_CHANNEL=chrome node scripts/dev/shot.mjs  # 换浏览器通道
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'data', 'tmp', 'shots');
const PORT = Number(process.env.SHOT_PORT ?? 5199);
const BASE = `http://localhost:${PORT}`;

const ALL_SCENES = [
  { name: 'menu', url: '/?lang=zh' },
  { name: 'menu-en', url: '/?lang=en' },
  { name: 'game-en', url: '/?dev=game&scene=midgame&human=1&lang=en' },
  { name: 'library-en', url: '/?screen=library&lang=en' },
  { name: 'replay-en', url: '/?dev=records&lang=en', clicks: [{ sel: '[data-testid="record-view"]' }], settleMs: 900 },
  { name: 'rules-en', url: '/?screen=rules&lang=en' },
  { name: 'settings', url: '/?screen=settings&lang=zh' },
  { name: 'settings-en', url: '/?screen=settings&lang=en' },
  { name: 'game-default', url: '/?dev=game&scene=default' },
  { name: 'game-reserved', url: '/?dev=game&scene=reserved' },
  { name: 'game-midgame-4p', url: '/?dev=game&scene=midgame&players=4' },
  { name: 'game-discard', url: '/?dev=game&scene=discard' },
  { name: 'game-noble', url: '/?dev=game&scene=noble' },
  { name: 'game-endgame', url: '/?dev=game&scene=endgame' },
  { name: 'game-fresh', url: '/?dev=game&scene=fresh&human=1' },
  { name: 'game-popover', url: '/?dev=game&scene=midgame&human=1', click: '[data-testid="board-card"]', clickNth: 4 },
  { name: 'game-clock', url: '/?dev=game&scene=midgame&human=1&turnsecs=60' },
  { name: 'game-clock-danger', url: '/?dev=game&scene=midgame&human=1&turnsecs=60&rushed=1' },
  { name: 'game-clock-over', url: '/?dev=game&scene=midgame&human=1&turnsecs=60&overtime=1' },
  { name: 'game-popover-nogold', url: '/?dev=game&scene=midgame&human=1&nogold=1', click: '[data-testid="board-card"]', clickNth: 4 },
  { name: 'game-deck-nogold', url: '/?dev=game&scene=fresh&human=1&nogold=1', click: '[data-testid="deck-stack-1"]' },
  { name: 'game-deck-popover', url: '/?dev=game&scene=fresh&human=1', click: '[data-testid="deck-stack-1"]' },
  { name: 'game-hover-mini', url: '/?dev=game&scene=reserved&human=1', hover: '[data-testid="reserved-mini"]', hoverNth: 1 },
  { name: 'game-hover-noble', url: '/?dev=game&scene=fresh&human=1', hover: '[title*="Charles"]' },
  { name: 'game-log', url: '/?dev=game&scene=midgame&human=1', click: 'text=记录' },
  { name: 'game-selection', url: '/?dev=game&scene=fresh&human=1', clicks: [{ sel: '[data-gem="white"]' }, { sel: '[data-gem="blue"]' }] },
  // 动画"飞行中"帧：点确认拿取后 ~150ms 截图（宝石正在飞）
  { name: 'game-anim-gems', url: '/?dev=game&scene=fresh&human=1', clicks: [{ sel: '[data-gem="white"]' }, { sel: '[data-gem="blue"]' }, { sel: 'text=确认拿取', after: 150 }] },
  { name: 'game-anim-gems-fly', url: '/?dev=game&scene=fresh&human=1', clicks: [{ sel: '[data-gem="white"]' }, { sel: '[data-gem="blue"]' }, { sel: 'text=确认拿取', after: 560 }] },
  { name: 'game-anim-reserve', url: '/?dev=game&scene=fresh&human=1', clicks: [{ sel: '[data-testid="deck-stack-1"]' }, { sel: 'button[data-primary="1"]', after: 150 }] },
  { name: 'game-anim-noble', url: '/?dev=game&scene=noble&human=1', clicks: [{ sel: 'button:has([title*="：需要"])', after: 160 }] },
  { name: 'library-noble', url: '/?screen=library', clicks: [{ sel: 'button[title="点击查看详情"]', nth: 3 }] },
  { name: 'library-card', url: '/?screen=library', clicks: [{ sel: 'button.card-face', nth: 2 }] },
  { name: 'game-lanview', url: '/?dev=game&scene=lanview' },
  { name: 'library', url: '/?screen=library' },
  { name: 'lobby', url: '/?screen=lobby' },
  { name: 'rules', url: '/?screen=rules' },
];

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1920', width: 1920, height: 1080 },
];

const wanted = process.argv.slice(2);
const scenes = wanted.length > 0 ? ALL_SCENES.filter((s) => wanted.includes(s.name)) : ALL_SCENES;

async function waitReady(timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE + '/');
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('preview 服务器未就绪');
}

mkdirSync(OUT, { recursive: true });

const server = spawn('npm', ['run', 'preview', '-w', '@splendor/client', '--', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});

let browser;
try {
  await waitReady();
  browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL ?? 'msedge', headless: true });
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    const reports = [];
    for (const scene of scenes) {
      await page.goto(BASE + scene.url, { waitUntil: 'load' });
      await page.waitForTimeout(750);
      if (scene.click) {
        try {
          const loc = page.locator(scene.click);
          const n = await loc.count();
          if (n > 0) {
            await loc.nth(Math.min(scene.clickNth ?? 0, n - 1)).click({ timeout: 4000 });
            await page.waitForTimeout(450);
          } else {
            console.log(`   ⚠ 未找到 ${scene.click}，跳过点击`);
          }
        } catch (err) {
          console.log(`   ⚠ 点击 ${scene.click} 失败：${String(err).slice(0, 60)}`);
        }
      }
      if (scene.clicks) {
        for (let idx = 0; idx < scene.clicks.length; idx++) {
          const c = scene.clicks[idx];
          try {
            const loc = page.locator(c.sel);
            const n = await loc.count();
            if (n > 0) {
              await loc.nth(Math.min(c.nth ?? 0, n - 1)).click({ timeout: 4000 });
              // 最后一次点击的等待时间可用 clicks[].after 覆盖（用于拍"飞行中"的动画帧）
              const isLast = idx === scene.clicks.length - 1;
              await page.waitForTimeout(c.after ?? (isLast ? (scene.settleMs ?? 340) : 340));
            } else {
              console.log(`   ⚠ 未找到 ${c.sel}`);
            }
          } catch (err) {
            console.log(`   ⚠ 点击 ${c.sel} 失败：${String(err).slice(0, 50)}`);
          }
        }
      }
      if (scene.hover) {
        try {
          const loc = page.locator(scene.hover);
          const n = await loc.count();
          if (n > 0) {
            const box = await loc.nth(Math.min(scene.hoverNth ?? 0, n - 1)).boundingBox();
            if (box) {
              // 用坐标移动鼠标：卡片有 hover 位移动画，locator.hover() 会因元素移动而超时
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
              await page.waitForTimeout(450);
            }
          }
        } catch (err) {
          console.log(`   ⚠ 悬停 ${scene.hover} 失败：${String(err).slice(0, 60)}`);
        }
      }
      const file = path.join(OUT, `${scene.name}-${vp.name}.png`);
      await page.screenshot({ path: file });
      const overflow = await page.evaluate(() => ({
        scrollH: document.documentElement.scrollHeight,
        clientH: document.documentElement.clientHeight,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      const scrollY = overflow.scrollH > overflow.clientH + 2;
      const scrollX = overflow.scrollW > overflow.clientW + 2;
      reports.push(`${scene.name}:${scrollY ? `Y${overflow.scrollH}` : 'ok'}${scrollX ? '/X!' : ''}`);
      console.log(`📸 ${path.relative(ROOT, file)}`);
    }
    console.log(`   视口 ${vp.name}: ${reports.join('  ')}`);
    await page.close();
  }
} finally {
  await browser?.close();
  server.kill();
  setTimeout(() => process.exit(0), 300);
}
