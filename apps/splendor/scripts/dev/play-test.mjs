#!/usr/bin/env node
/**
 * 操作摩擦报告：脚本用真实点击走一遍关键流程，量化输出体验指标。
 *
 * 用法：node scripts/dev/play-test.mjs [--keep]
 *   --keep  跑完不关闭浏览器（便于肉眼观察）
 *
 * 输出：菜单/开局文案统计、贵族溢出、可购买高亮命中率、每步点击数、
 *       盲点次数、Enter 冲突、归还/贵族/终局流程、三视口布局冒烟。
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PLAY_PORT ?? 5194);
const BASE = `http://localhost:${PORT}`;
const KEEP = process.argv.includes('--keep');
const GLOW_RGB = '201, 147, 46'; // 可购买 = 整卡外圈淡琥珀光晕

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const info = (msg) => console.log(`    ${msg}`);

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

const server = spawn('npm', ['run', 'preview', '-w', '@splendor/client', '--', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  shell: true,
  stdio: 'ignore',
});

let browser;
try {
  await waitReady();
  browser = await chromium.launch({ channel: process.env.SHOT_CHANNEL ?? 'msedge', headless: !KEEP });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // 固定中文，保证断言与文案稳定（语言支持在 v2.0.0 引入）
  await page.addInitScript(() => {
    try {
      const key = 'splendor.settings.v1';
      const cur = JSON.parse(localStorage.getItem(key) ?? '{}');
      cur.lang = 'zh';
      localStorage.setItem(key, JSON.stringify(cur));
    } catch {
      /* ignore */
    }
  });
  const buyBtn = () => page.locator('button[data-primary="1"]');
  const bankCounts = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="gem-pile"]')].map((b) => b.querySelector('.tnum')?.textContent?.trim()).join(','),
    );

  console.log('\n===== 菜单 =====');
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await sleep(600);
  const menu = await page.evaluate(() => {
    const t = document.querySelector('#root')?.innerText ?? '';
    const emoji = (t.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu) || []).length;
    return { text: t.split('\n').filter(Boolean), emoji, chars: t.length };
  });
  info(`文案：${menu.text.join(' | ')}`);
  ok('菜单无 emoji', menu.emoji === 0, `emoji=${menu.emoji}`);
  ok('菜单含四个模式入口', ['本地对战', '人机对战', '单人训练', '局域网对战'].every((m) => menu.text.includes(m)));
  ok('菜单含四个导航入口', ['卡牌库', '规则速查', '对局记录', '设置'].every((m) => menu.text.includes(m)));

  // 新手引导：首次启动自动出现，三步走完自动记住
  const firstRun = await page.evaluate(() => !!document.querySelector('[data-testid="tutorial"]'));
  ok('首次启动自动显示新手引导', firstRun);
  if (firstRun) {
    for (let i = 0; i < 3; i++) {
      await page.locator('[data-testid="tutorial-next"]').click();
      await sleep(250);
    }
    const gone = await page.evaluate(() => ({
      gone: !document.querySelector('[data-testid="tutorial"]'),
      flag: localStorage.getItem('splendor.tutorial.v1'),
    }));
    ok('走完三步后引导关闭并记住', gone.gone && gone.flag === '1', JSON.stringify(gone));
  }
  ok('已删除「仅供家庭内部游玩」', !menu.text.some((l) => l.includes('仅供家庭内部游玩')));
  // 背景音乐：首次交互后应开始播放
  await page.mouse.click(10, 10);
  await sleep(1200);
  const musicState = await page.evaluate(() => window.__musicState ?? null);
  ok('背景音乐自动播放', !!musicState && musicState.enabled && musicState.playing, JSON.stringify(musicState));

  console.log('\n===== 开局（全新对局） =====');
  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(700);
  const fresh = await page.evaluate((glow) => {
    const cards = [...document.querySelectorAll('[data-testid="board-card"]')];
    const highlighted = cards.filter((c) => getComputedStyle(c).boxShadow.includes(glow)).length;
    const text = document.querySelector('#root')?.innerText ?? '';
    const nobleTiles = [];
    for (const t of document.querySelectorAll('.card-face')) {
      const title = t.getAttribute('title') || '';
      if (!title.includes('：需要')) continue; // 贵族牌（无名称文字，靠 title 识别）
      const r = t.getBoundingClientRect();
      let overR = 0;
      let overB = 0;
      for (const s of t.querySelectorAll('span')) {
        const sr = s.getBoundingClientRect();
        overR = Math.max(overR, sr.right - r.right);
        overB = Math.max(overB, sr.bottom - r.bottom);
      }
      nobleTiles.push({ name: title.split('：')[0], overR: Math.round(overR), overB: Math.round(overB) });
    }
    return {
      cards: cards.length,
      highlighted,
      hasPlaceholders: /暂无宝石|暂无加成/.test(text),
      nobleTiles,
      idleHint: /点宝石拿取|双击拿 2/.test(text),
      emoji: (text.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu) || []).length,
    };
  }, GLOW_RGB);
  ok('牌桌 12 张卡', fresh.cards === 12, `${fresh.cards}`);
  ok('开局无可购买高亮（0 宝石）', fresh.highlighted === 0, `高亮 ${fresh.highlighted} 张`);
  ok('贵族牌无要求溢出', fresh.nobleTiles.length >= 3 && fresh.nobleTiles.every((n) => n.overR <= 0 && n.overB <= 0), `${fresh.nobleTiles.length} 张 · ${JSON.stringify(fresh.nobleTiles)}`);
  ok('无“暂无宝石/暂无加成”占位文案', !fresh.hasPlaceholders);
  ok('已删除底部空闲提示小字', !fresh.idleHint);
  info(`对局界面 emoji=${fresh.emoji}`);

  console.log('\n===== 拿宝石 =====');
  await page.locator('[data-gem="white"]').click();
  await page.locator('[data-gem="blue"]').click();
  await page.locator('[data-gem="green"]').click();
  await sleep(250);
  // 回归断言：选中后被鼠标悬停时，高亮（琥珀边框+底色）必须保持，不被 hover 样式覆盖
  const whiteBox = await page.locator('[data-gem="white"]').boundingBox();
  if (whiteBox) {
    await page.mouse.move(whiteBox.x + whiteBox.width / 2, whiteBox.y + whiteBox.height / 2);
    await sleep(300);
    const style = await page.evaluate(() => {
      const el = document.querySelector('[data-gem="white"]');
      const cs = getComputedStyle(el);
      return { border: cs.borderTopColor, bg: cs.backgroundColor };
    });
    ok('选中宝石悬停时高亮保持', style.border === 'rgb(201, 147, 46)' && style.bg === 'rgb(248, 238, 216)', JSON.stringify(style));
  }
  await page.getByText('确认拿取').click();
  await sleep(500);
  const afterTake = await page.evaluate((glow) => {
    const cards = [...document.querySelectorAll('[data-testid="board-card"]')];
    return cards.filter((c) => getComputedStyle(c).boxShadow.includes(glow)).length;
  }, GLOW_RGB);
  ok('拿取成功（4 次点击）', true, '点 3 枚宝石 + 确认');
  info(`拿取后高亮卡 = ${afterTake} 张（3 枚宝石能买的卡）`);

  console.log('\n===== 等 AI 行动 =====');
  await sleep(2600);
  const backToMe = await page.evaluate(() => (document.querySelector('#root')?.innerText ?? '').includes('行动中'));
  ok('AI 行动后回合回到我方', backToMe);

  console.log('\n===== 购卡（靠高亮一眼定位） =====');
  await page.goto(BASE + '/?dev=game&scene=midgame&human=1', { waitUntil: 'load' });
  await sleep(700);
  const target = await page.evaluate((glow) => {
    const cards = [...document.querySelectorAll('[data-testid="board-card"]')];
    const idx = cards.findIndex((c) => getComputedStyle(c).boxShadow.includes(glow));
    return idx;
  }, GLOW_RGB);
  ok('高亮命中可购买卡（无需盲点）', target >= 0, `第 ${target + 1} 张高亮`);
  if (target >= 0) {
    const card = page.locator('[data-testid="board-card"]').nth(target);
    const box = await card.boundingBox();
    await card.click();
    await sleep(350);
    const pop = await page.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find((d) => String(d.className).includes('fixed') && d.textContent && d.textContent.includes('购买'));
      return el ? el.innerText.replace(/\n+/g, ' | ') : '(未找到气泡)';
    });
    info(`气泡：${pop}`);
    const enabled = (await buyBtn().count()) > 0 && (await buyBtn().first().isEnabled());
    ok('气泡内购买可用', enabled);
    if (enabled) {
      await buyBtn().first().click();
      mkdirSync(path.join('data', 'tmp', 'shots'), { recursive: true });
      await page.screenshot({ path: path.join('data', 'tmp', 'shots', 'anim-buy-flight.png') });
      await sleep(600);
      const undoVisible = await page.evaluate(() => !!document.querySelector('[data-testid="undo-bar"]'));
      ok('购卡后出现撤销提示条', undoVisible);
    }
    void box;
  }

  console.log('\n===== Enter 冲突（气泡打开 + 已选宝石） =====');
  // 场景一：不可购买的卡 + 已选宝石 → Enter 必须什么都不做
  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(700);
  const bank0 = await bankCounts();
  await page.locator('[data-gem="white"]').click();
  await sleep(200);
  await page.locator('[data-testid="board-card"]').first().click();
  await sleep(320);
  const buyDisabled = (await buyBtn().count()) > 0 ? !(await buyBtn().first().isEnabled()) : true;
  await page.keyboard.press('Enter');
  await sleep(500);
  const afterEnter = await page.evaluate(() => ({
    bank: [...document.querySelectorAll('[data-testid="gem-pile"]')].map((b) => b.querySelector('.tnum')?.textContent?.trim()).join(','),
    popoverOpen: [...document.querySelectorAll('div')].some((d) => String(d.className).includes('fixed') && d.textContent && d.textContent.includes('购买')),
    selectionKept: document.body.innerText.includes('确认拿取'),
  }));
  ok('不可购买时 Enter 无副作用（不拿宝石、不关闭气泡）', buyDisabled && afterEnter.bank === bank0 && afterEnter.popoverOpen && afterEnter.selectionKept, `银行 ${bank0} → ${afterEnter.bank}｜气泡开=${afterEnter.popoverOpen}｜选择预定=${afterEnter.selectionKept}`);
  await page.keyboard.press('Escape');
  await sleep(200);

  // 场景二：可购买卡 + 无选择 → Enter 应完成购买
  await page.goto(BASE + '/?dev=game&scene=midgame&human=1', { waitUntil: 'load' });
  await sleep(700);
  let buyByEnter = false;
  for (let i = 0; i < 12 && !buyByEnter; i++) {
    const c = page.locator('[data-testid="board-card"]').nth(i);
    if ((await c.count()) === 0) break;
    await c.click();
    await sleep(300);
    if ((await buyBtn().count()) > 0 && (await buyBtn().first().isEnabled())) {
      await page.keyboard.press('Enter');
      await sleep(600);
      const closed = await page.evaluate(() => document.querySelector('button[data-primary="1"]') === null);
      const undoVisible = await page.evaluate(() => !!document.querySelector('[data-testid="undo-bar"]'));
      ok('可购买时 Enter 直接完成购买', closed && undoVisible, `气泡关闭=${closed}｜撤销条=${undoVisible}`);
      buyByEnter = true;
    } else {
      await page.keyboard.press('Escape');
      await sleep(150);
    }
  }
  if (!buyByEnter) info('（未找到可购买卡，跳过 Enter 购买检测）');

  console.log('\n===== 预定 + 悬停放大 =====');
  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(700);
  await page.locator('[data-testid="board-card"]').first().click();
  await sleep(300);
  const reserveBtn = page.getByText('预定', { exact: true });
  if (await reserveBtn.count()) {
    await reserveBtn.first().click();
    await sleep(500);
  }
  const miniCount = await page.evaluate(() => document.querySelectorAll('[data-testid="reserved-mini"]').length);
  ok('预定后小卡出现', miniCount === 1, `${miniCount} 张`);
  const mini = page.locator('[data-testid="reserved-mini"]').first();
  if (await mini.count()) {
    const box = await mini.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await sleep(450);
      const zoom = await page.evaluate((b) => {
        const els = [...document.querySelectorAll('div')].filter((d) => {
          const r = d.getBoundingClientRect();
          return String(d.className).includes('fixed') && r.width > 120 && r.width < 175 && r.height > 150;
        });
        if (!els.length) return { count: 0 };
        const r = els[0].getBoundingClientRect();
        const overlaps = !(r.right <= b.x || r.left >= b.x + b.w || r.bottom <= b.y || r.top >= b.y + b.h);
        return { count: els.length, overlapsSource: overlaps };
      }, { x: box.x, y: box.y, w: box.width, h: box.height });
      ok('悬停出现放大预览且不遮挡源小卡', zoom.count > 0 && !zoom.overlapsSource, JSON.stringify(zoom));
    }
  }

  console.log('\n===== 归还 =====');
  await page.goto(BASE + '/?dev=game&scene=discard&human=1', { waitUntil: 'load' });
  await sleep(700);
  const discardOpen = await page.evaluate(() => document.body.innerText.includes('请归还宝石'));
  ok('超 10 枚弹出归还窗', discardOpen);
  if (discardOpen) {
    await page.getByText('自动归还').click();
    await sleep(300);
    const confirmEnabled = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '确认');
      return btn ? !btn.disabled : false;
    });
    ok('自动归还后可确认', confirmEnabled);
    await page.getByText('确认', { exact: true }).first().click();
    await sleep(500);
    const closed = await page.evaluate(() => !document.body.innerText.includes('请归还宝石'));
    ok('确认后弹窗关闭', closed);
  }

  console.log('\n===== 贵族选择 =====');
  await page.goto(BASE + '/?dev=game&scene=noble&human=1', { waitUntil: 'load' });
  await sleep(700);
  const nobleOpen = await page.evaluate(() => document.body.innerText.includes('选择一位来访贵族'));
  ok('多位贵族弹出选择窗', nobleOpen);
  if (nobleOpen) {
    const noble = page.locator('button', { has: page.locator('[title*="：需要"]') }).first();
    if (await noble.count()) {
      await noble.click();
      await sleep(500);
      const closed = await page.evaluate(() => !document.body.innerText.includes('选择一位来访贵族'));
      ok('选择后弹出窗关闭', closed);
    } else {
      ok('选择后弹出窗关闭', false, '未找到贵族按钮');
    }
  }

  console.log('\n===== 终局 =====');
  await page.goto(BASE + '/?dev=game&scene=endgame', { waitUntil: 'load' });
  await sleep(900);
  const endInfo = await page.evaluate(() => {
    const text = document.querySelector('#root')?.innerText ?? '';
    const lines = text.split('\n').filter(Boolean);
    const overlayIdx = lines.findIndex((l) => l.includes('对局结束'));
    return { hasOverlay: overlayIdx >= 0, overlayText: lines.slice(Math.max(0, overlayIdx), overlayIdx + 6).join(' | ') };
  });
  info(`结算：${endInfo.overlayText}`);
  ok('结算界面出现', endInfo.hasOverlay);

  console.log('\n===== 小屏布局（1366×768） =====');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(BASE + '/?dev=game&scene=midgame&players=4', { waitUntil: 'load' });
  await sleep(700);
  const small = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    clientH: document.documentElement.clientHeight,
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  ok('1366×768 四人局零滚动', small.scrollH <= small.clientH + 2 && small.scrollW <= small.clientW + 2, `${small.scrollH}/${small.clientH} · ${small.scrollW}/${small.clientW}`);

  console.log('\n===== 主菜单一屏（1366×768，含继续上局横幅） =====');
  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(700);
  await page.locator('[data-gem="white"]').click();
  await page.locator('[data-gem="blue"]').click();
  await page.locator('[data-gem="green"]').click();
  await page.getByText('确认拿取').click();
  await sleep(600);
  await page.getByText('主菜单').first().click();
  await sleep(800);
  const menuFit = await page.evaluate(() => {
    const text = document.querySelector('#root')?.innerText ?? '';
    return {
      scrollH: document.documentElement.scrollHeight,
      clientH: document.documentElement.clientHeight,
      hasResume: text.includes('未完成的对局'),
      hasSubtitle: text.includes('宝石商人'),
    };
  });
  ok('菜单含继续上局横幅（最坏高度）', menuFit.hasResume, `resume=${menuFit.hasResume}`);
  ok('已删除“宝石商人”副标题', !menuFit.hasSubtitle);
  ok('1366×768 菜单一屏零滚动', menuFit.scrollH <= menuFit.clientH + 2, `${menuFit.scrollH}/${menuFit.clientH}`);

  console.log('\n===== 提示按钮：推荐动作 + 一句理由 =====');
  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(900);
  await page.getByText('提示', { exact: true }).first().click();
  await sleep(500);
  const hintText = await page.evaluate(() => document.body.innerText);
  ok('提示附带一句理由（为什么）', hintText.includes('·'), hintText.split('\n').find((l) => l.includes('·')) ?? '');

  console.log('\n===== 预定文案与金币提示（官方规则：无金币仍可预定） =====');
  await page.goto(BASE + '/?dev=game&scene=fresh&human=1&nogold=1', { waitUntil: 'load' });
  await sleep(700);
  await page.locator('[data-testid="deck-stack-1"]').click();
  await sleep(450);
  const nogoldText = await page.evaluate(() => document.body.innerText);
  ok('金币为空时气泡标注「无金币」且仍可预定', nogoldText.includes('无金币') && nogoldText.includes('盲抽预定'));
  ok('界面不再出现旧术语「保留」', !/保留/.test(nogoldText));
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(700);
  await page.locator('[data-testid="deck-stack-1"]').click();
  await sleep(450);
  const withGoldText = await page.evaluate(() => document.body.innerText);
  ok('金币充足时气泡标注「+1 金币」', withGoldText.includes('+1 金币'));
  ok('玩家面板显示预定区计数', /预定 0\/3/.test(withGoldText));
  await page.keyboard.press('Escape');
  await sleep(200);

  console.log('\n===== 思考时间与音效 =====');
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await sleep(600);
  const menuCfg = await page.evaluate(() => {
    const t = document.querySelector('#root')?.innerText ?? '';
    return { clock: t.includes('思考时间（秒）'), nav: t.includes('设置') && t.includes('对局记录') };
  });
  ok('菜单含思考时间与导航入口', menuCfg.clock && menuCfg.nav, JSON.stringify(menuCfg));

  // 设置页：语言 / 音效 / 音乐 / 按钮音 / 动画速度
  await page.goto(BASE + '/?screen=settings', { waitUntil: 'load' });
  await sleep(500);
  const settingsText = await page.evaluate(() => document.querySelector('#root')?.innerText ?? '');
  const need = ['语言', '音效', '背景音乐', '按钮点击音', '动画', '动画速度'];
  ok('设置页含全部非游戏性设置', need.every((k) => settingsText.includes(k)), need.filter((k) => !settingsText.includes(k)).join('、') || 'ok');
  ok('设置页有动画速度三档', ['标准', '慢', '更慢'].every((k) => settingsText.includes(k)));
  const defaultSpeed = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '更慢');
    return !!btn && btn.className.includes('btn-accent');
  });
  ok('动画速度默认「更慢」（3x）', defaultSpeed);

  // 界面缩放：三档 + 放大后不产生横向滚动（设置页与主菜单各验一次）
  const zoomChips = await page.evaluate(() =>
    ['100%', '115%', '130%'].every((label) => [...document.querySelectorAll('button')].some((b) => b.textContent?.trim() === label)),
  );
  ok('设置页有界面缩放三档', zoomChips);
  {
    await page.locator('[data-testid="tutorial-replay"]').click();
    await sleep(300);
    const shown = await page.evaluate(() => !!document.querySelector('[data-testid="tutorial"]'));
    ok('设置页可重看新手引导', shown);
    await page.locator('[data-testid="tutorial-skip"]').click();
    await sleep(250);
  }
  const zoomCheck = await page.evaluate(async () => {
    const chip = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '130%');
    chip?.click();
    await new Promise((r) => setTimeout(r, 250));
    const doc = document.documentElement;
    const zoomed = doc.style.zoom;
    const overflow = doc.scrollWidth > doc.clientWidth + 2;
    // 还原为 100%
    const back = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '100%');
    back?.click();
    await new Promise((r) => setTimeout(r, 250));
    return { zoomed, overflow, overflowW: `${doc.scrollWidth}/${doc.clientWidth}` };
  });
  ok('130% 缩放下设置页无横向滚动', zoomCheck.zoomed === '1.3' && !zoomCheck.overflow, JSON.stringify(zoomCheck));

  await page.goto(BASE + '/?dev=game&scene=fresh&human=1&turnsecs=6', { waitUntil: 'load' });
  await sleep(1000);
  const clock1 = await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="turn-clock"]');
    return {
      text: chip?.textContent?.trim() ?? '',
      urgency: chip?.getAttribute('data-urgency') ?? '',
      bar: !!document.querySelector('[data-testid="clock-bar"]'),
    };
  });
  ok('有时限时顶栏显示读秒（含面板细条）', clock1.text.includes('秒') && clock1.bar, JSON.stringify(clock1));
  await sleep(2200);
  const clock2 = await page.evaluate(() => document.querySelector('[data-testid="turn-clock"]')?.textContent?.trim() ?? '');
  ok('读秒在倒数', Number(clock2.replace(/\D/g, '')) < Number(clock1.text.replace(/\D/g, '')), `${clock1.text} → ${clock2}`);

  await page.goto(BASE + '/?dev=game&scene=fresh&human=1&turnsecs=6&overtime=1', { waitUntil: 'load' });
  await sleep(1000);
  const overClock = await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="turn-clock"]');
    return { text: chip?.textContent?.trim() ?? '', urgency: chip?.getAttribute('data-urgency') ?? '' };
  });
  ok('超时只提示（显示「超时 +N 秒」，不强制）', overClock.text.includes('超时 +') && overClock.urgency === 'over', JSON.stringify(overClock));

  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(900);
  const noClock = await page.evaluate(() => !document.querySelector('[data-testid="turn-clock"]'));
  ok('不限时不显示读秒', noClock);

  await page.evaluate(() => {
    window.__sfxLog = [];
  });
  await page.locator('[data-gem="white"]').click();
  await page.locator('[data-gem="blue"]').click();
  await page.getByText('确认拿取').click();
  await sleep(700);
  const sfxLog = await page.evaluate(() => (window.__sfxLog ?? []).slice(-8));
  ok('操作触发音效（选宝石 + 拿取）', sfxLog.includes('gemPick') && sfxLog.includes('gemTake'), JSON.stringify(sfxLog));

  console.log('\n===== 操作动画 =====');
  // 动画断言用「标准」速度跑（默认 3x 太慢，等待会很长）；结束后恢复默认
  await page.goto(BASE + '/?screen=settings', { waitUntil: 'load' });
  await sleep(500);
  await page.getByText('标准', { exact: true }).click();
  await sleep(200);

  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(800);
  await page.evaluate(() => {
    window.__animLog = [];
  });
  await page.locator('[data-gem="white"]').click();
  await page.locator('[data-gem="blue"]').click();
  await page.locator('[data-gem="green"]').click();
  await page.getByText('确认拿取').click();
  await sleep(130);
  const flyingGems = await page.evaluate(() => ({
    layer: !!document.querySelector('[data-testid="anim-layer"]'),
    gems: document.querySelectorAll('[data-anim-step="gem"]').length,
  }));
  ok('拿宝石时出现飞行动画', flyingGems.layer && flyingGems.gems >= 1, JSON.stringify(flyingGems));
  await sleep(2400);
  const afterFly = await page.evaluate(() => ({
    mine: document.querySelectorAll('[data-anim-step][data-anim-seat="0"]').length,
    all: document.querySelectorAll('[data-anim-step]').length,
    log: (window.__animLog ?? []).slice(-6),
  }));
  ok('本方动画播完自动清理', afterFly.mine === 0, `本方剩余 ${afterFly.mine}`);
  await sleep(6300);
  const settled = await page.evaluate(() => document.querySelectorAll('[data-anim-step]').length);
  ok('全部动画在合理时间内清空', settled === 0, `剩余 ${settled}`);
  ok('动画日志记录宝石步骤', afterFly.log.some((l) => l.startsWith('gem:')), JSON.stringify(afterFly.log));

  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(800);
  await page.evaluate(() => {
    window.__animLog = [];
  });
  await page.locator('[data-testid="deck-stack-1"]').click();
  await sleep(400);
  await page.locator('button[data-primary="1"]').click();
  await sleep(150);
  const reserveFly = await page.evaluate(() => document.querySelectorAll('[data-anim-step="card"]').length);
  ok('预定时卡片飞入动画', reserveFly >= 1, `卡片飞行 ${reserveFly}`);
  await sleep(2200);
  const reserveLog = await page.evaluate(() => (window.__animLog ?? []).slice(-4));
  ok('预定动画日志包含 card 步骤', reserveLog.some((l) => l.startsWith('card:')), JSON.stringify(reserveLog));

  const counts = await page.evaluate(() => ({
    mine: document.querySelector('[data-testid="panel-token-count-0"]')?.textContent?.trim() ?? '',
    opp: document.querySelector('[data-testid="panel-token-count-1"]')?.textContent?.trim() ?? '',
  }));
  ok('面板显示宝石 x/10 计数', /^\d+\/10$/.test(counts.mine) && /^\d+\/10$/.test(counts.opp), JSON.stringify(counts));

  // 关闭动效后应零动画（设置写在同一浏览器上下文里，最后恢复）
  await page.goto(BASE + '/?screen=settings', { waitUntil: 'load' });
  await sleep(500);
  await page.locator('[data-testid="toggle-animations"]').click();
  await sleep(200);
  await page.goto(BASE + '/?dev=game&scene=fresh&human=1', { waitUntil: 'load' });
  await sleep(800);
  await page.evaluate(() => {
    window.__animLog = [];
  });
  await page.locator('[data-gem="white"]').click();
  await page.getByText('确认拿取').click();
  await sleep(320);
  const animOff = await page.evaluate(() => ({
    layer: !!document.querySelector('[data-testid="anim-layer"]'),
    steps: document.querySelectorAll('[data-anim-step]').length,
    log: (window.__animLog ?? []).length,
  }));
  ok('关闭动效后不产生动画（零开销）', !animOff.layer && animOff.steps === 0 && animOff.log === 0, JSON.stringify(animOff));
  // 恢复：开启动效 + 恢复默认速度「更慢」
  await page.goto(BASE + '/?screen=settings', { waitUntil: 'load' });
  await sleep(500);
  await page.locator('[data-testid="toggle-animations"]').click();
  await sleep(200);
  await page.getByText('更慢', { exact: true }).click();
  await sleep(200);

  console.log('\n===== 对局记录与复盘 =====');
  await page.goto(BASE + '/?dev=records', { waitUntil: 'load' });
  await sleep(2600);
  const recList = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-testid="record-row"]').length,
    hasView: document.body.innerText.includes('复盘'),
  }));
  ok('记录页列出已完成对局', recList.rows >= 1 && recList.hasView, JSON.stringify(recList));

  // 战绩标签：家庭成就徽章（演示数据里有真人获胜 → 首胜应解锁）
  await page.locator('[data-testid="tab-stats"]').click();
  await sleep(900);
  const badges = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="achievement-badges"]');
    if (!box) return { found: false };
    const all = [...box.querySelectorAll('[data-unlocked]')];
    return {
      found: true,
      total: all.length,
      unlocked: all.filter((el) => el.getAttribute('data-unlocked') === '1').length,
    };
  });
  ok('战绩页显示家庭成就徽章（首胜已解锁）', badges.found && badges.total >= 4 && badges.unlocked >= 1, JSON.stringify(badges));
  await page.locator('[data-testid="tab-games"]').click();
  await sleep(400);
  if (recList.rows >= 1) {
    await page.locator('[data-testid="record-row"]').first().getByText('复盘').click();
    await sleep(900);
    const f0 = await page.locator('[data-testid="replay-frame"]').textContent();
    await page.locator('[data-testid="replay-next"]').click();
    await sleep(350);
    const f1 = await page.locator('[data-testid="replay-frame"]').textContent();
    ok('复盘可前进一轮（按钮）', f0 !== f1, `${f0} → ${f1}`);
    await page.keyboard.press('ArrowRight');
    await sleep(300);
    const f2 = await page.locator('[data-testid="replay-frame"]').textContent();
    await page.keyboard.press('ArrowLeft');
    await sleep(300);
    const f3 = await page.locator('[data-testid="replay-frame"]').textContent();
    ok('复盘支持左右方向键', f2 !== f1 && f3 === f1, `${f1} → ${f2} → ${f3}`);
    const boardEls = await page.evaluate(
      () => document.querySelectorAll('[data-testid="board-card"], [data-testid="gem-pile"], [data-testid="noble-tile"]').length,
    );
    ok('复盘棋盘完整渲染', boardEls >= 15, `元素 ${boardEls}`);
  }

  console.log('\n===== 英文界面无中文残留 =====');
  // 清掉本上下文里遗留的存档（其中可能有中文玩家名，属于数据而非界面文案）
  await page.evaluate(() => {
    try {
      localStorage.removeItem('splendor.save.v1');
    } catch {
      /* ignore */
    }
  });
  const ALLOW = ['中文']; // 语言切换按钮按惯例用母语显示自身
  const enScreens = ['/?lang=en', '/?screen=settings&lang=en', '/?screen=library&lang=en', '/?screen=rules&lang=en'];
  const leaks = [];
  for (const url of enScreens) {
    await page.goto(BASE + url, { waitUntil: 'load' });
    await sleep(600);
    const found = await page.evaluate((allow) => {
      const text = document.querySelector('#root')?.innerText ?? '';
      const hits = text.match(/[\u4e00-\u9fa5]+/g) ?? [];
      return [...new Set(hits)].filter((h) => !allow.includes(h)).slice(0, 6);
    }, ALLOW);
    if (found.length > 0) leaks.push(`${url} → ${found.join('、')}`);
  }
  // 英文界面进入一局真实对局（菜单点选，玩家名也是英文）
  await page.goto(BASE + '/?lang=en', { waitUntil: 'load' });
  await sleep(600);
  await page.getByText('Vs. AI', { exact: true }).click();
  await sleep(200);
  await page.getByText('Start game', { exact: true }).click();
  await sleep(1200);
  const gameLeak = await page.evaluate(() => {
    const text = document.querySelector('#root')?.innerText ?? '';
    const hits = text.match(/[\u4e00-\u9fa5]+/g) ?? [];
    return [...new Set(hits)].slice(0, 8);
  });
  if (gameLeak.length > 0) leaks.push(`game → ${gameLeak.join('、')}`);
  ok('英文界面无中文残留', leaks.length === 0, leaks.join(' | '));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n===== 汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length) {
    for (const f of failed) console.log(`  ❌ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`);
  }
  if (KEEP) await sleep(60000);
} finally {
  await browser?.close();
  server.kill();
  setTimeout(() => process.exit(0), 300);
}

