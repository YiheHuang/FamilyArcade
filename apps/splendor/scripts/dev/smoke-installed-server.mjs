#!/usr/bin/env node
/**
 * 安装包服务器端到端冒烟：对桌面应用内置的局域网服务器（默认 8080）做真实浏览器验证。
 * 前置：先启动打包后的应用（packages/electron/release/win-unpacked/Splendor.exe）。
 *
 * 用法：node scripts/dev/smoke-installed-server.mjs [--keep]
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:8080';
const KEEP = process.argv.includes('--keep');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
try {
  const health = await fetch(BASE + '/healthz');
  if (!health.ok) throw new Error(`healthz ${health.status}`);

  browser = await chromium.launch({ channel: 'msedge', headless: !KEEP });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await sleep(700);

  const menuOk = await page.evaluate(() => (document.querySelector('#root')?.innerText ?? '').includes('人机对战'));
  console.log(`菜单加载：${menuOk ? '✅' : '❌'}`);

  await page.getByText('局域网对战').first().click();
  await sleep(400);
  // 等待 WebSocket 连接就绪
  await page.waitForFunction(() => (document.querySelector('#root')?.innerText ?? '').includes('已连接服务器'), null, { timeout: 8000 }).catch(() => {});
  const nameInput = page.locator('input[placeholder="例如：爸爸"]');
  if (await nameInput.count()) await nameInput.first().fill('家人甲');
  await page.getByText('创建房间').first().click();
  await sleep(1200);
  if (!(await page.evaluate(() => (document.querySelector('#root')?.innerText ?? '').includes('房间码')))) {
    // 一次重试：连接就绪后按钮才真正生效
    await page.getByText('创建房间').first().click();
    await sleep(1200);
  }

  const state = await page.evaluate(() => {
    const text = document.querySelector('#root')?.innerText ?? '';
    const code = text.match(/房间码\s*\n?\s*([A-Z0-9]{4})/)?.[1] ?? '';
    const urls = [...text.matchAll(/http:\/\/\d+\.\d+\.\d+\.\d+:\d+/g)].map((m) => m[0]);
    return { code, urls: [...new Set(urls)], hasEmptySeat: /等待加入/.test(text) };
  });
  console.log(`创建房间：${state.code ? `✅ 房间码 ${state.code}` : '❌ 未拿到房间码'}`);
  console.log(`局域网地址展示：${state.urls.length ? '✅ ' + state.urls.join('、') : '❌ 无'}`);
  console.log(`空座位等待加入：${state.hasEmptySeat ? '✅' : '❌'}`);

  // 第二个浏览器（模拟家人的另一台电脑）用房间码加入
  let joined = false;
  if (state.code) {
    const page2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page2.goto(BASE + '/', { waitUntil: 'load' });
    await sleep(600);
    await page2.getByText('局域网对战').first().click();
    await sleep(400);
    await page2
      .waitForFunction(() => (document.querySelector('#root')?.innerText ?? '').includes('已连接服务器'), null, { timeout: 8000 })
      .catch(() => {});
    const name2 = page2.locator('input[placeholder="例如：爸爸"]');
    if (await name2.count()) await name2.first().fill('家人乙');
    const codeInput = page2.locator('input[placeholder="4 位房间码"]');
    await codeInput.first().fill(state.code);
    await page2.getByText('加入', { exact: true }).first().click();
    await sleep(1400);
    const text2 = await page2.evaluate(() => document.querySelector('#root')?.innerText ?? '');
    const text1 = await page.evaluate(() => document.querySelector('#root')?.innerText ?? '');
    joined = text2.includes('家人乙') && /已加入|你/.test(text2) && text1.includes('家人乙');
    console.log(`家人加入：${joined ? '✅ 房主见到家人乙，加入方进入房间' : '❌ 未成功'}`);
    await page2.close();
  }

  console.log(`退出码：${menuOk && state.code && joined ? 0 : 1}`);
} finally {
  if (KEEP) await sleep(60000);
  await browser?.close();
}
