import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:5225';
const APP = new URL(BASE);
APP.searchParams.set('fast', '1');
const URL_APP = APP.toString();

let checks = 0;
const assert = (condition, message) => {
  checks += 1;
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const watch = (page, label) => {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${label}: ${String(error)}`));
};

async function prepare(page, lang = 'en') {
  await page.addInitScript(
    ({ language }) => {
      localStorage.setItem('familyarcade.lang', language);
      if (!sessionStorage.getItem('idiom-chain.e2e.ready')) {
        localStorage.removeItem('familyarcade.idiom-chain.save');
        localStorage.removeItem('familyarcade.idiom-chain.record');
        sessionStorage.setItem('idiom-chain.e2e.ready', '1');
      }
    },
    { language: lang },
  );
}

async function playText(page, text, keyboard = true) {
  await page.getByTestId('idiom-input').fill(text);
  if (keyboard) await page.getByTestId('idiom-input').press('Enter');
  else await page.getByTestId('play').click();
  await page.waitForTimeout(120);
}

async function waitTurn(page, turn, timeout = 10000) {
  await page.waitForFunction(
    (expected) => document.querySelector('.game-shell')?.getAttribute('data-turn') === String(expected),
    turn,
    { timeout },
  );
}

async function waitChain(page, count, timeout = 8000) {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.chain-entry').length >= expected,
    count,
    { timeout },
  );
}

const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(page, 'main');
await prepare(page, 'en');
await page.goto(URL_APP, { waitUntil: 'networkidle' });
assert((await page.locator('h1').innerText()).includes('Idiom Chain'), 'home title missing');
assert(await page.getByTestId('start-solo').isVisible(), 'solo button missing');
assert(await page.getByTestId('start-lan').isVisible(), 'LAN button missing');

// Solo vs two AI seats, using the keyboard path.
await page.getByTestId('start-solo').click();
await page.getByTestId('players-3').click();
await page.getByTestId('level-hard').click();
await page.getByTestId('begin').click();
await page.waitForSelector('.game-shell');
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '0', 'solo did not start on the human seat');
assert((await page.locator('.chain-entry').count()) === 0, 'solo chain did not start empty');
await playText(page, '一心一意');
await waitTurn(page, 0);
await waitChain(page, 3);
const chainAfterAi = await page.locator('.chain-idiom').allInnerTexts();
assert(chainAfterAi.length >= 3, 'two AI seats did not reply');
assert(chainAfterAi[0] === '一心一意', 'human opener missing from chain');

// Reasoned keyboard hint.
await page.keyboard.press('Alt+h');
await page.waitForSelector('[data-testid="hint-card"]');
const hintWord = (await page.getByTestId('hint-idiom').innerText()).trim();
const lastWord = chainAfterAi[chainAfterAi.length - 1];
assert(hintWord.charAt(0) === lastWord.slice(-1), `hint ${hintWord} does not follow ${lastWord}`);
assert((await page.locator('.hint-reason').innerText()).length > 8, 'hint reason missing');

// Undo steps back over the AI replies to the human decision.
await page.getByTestId('undo').click();
await page.waitForTimeout(200);
assert((await page.locator('.chain-entry').count()) === 0, 'undo did not clear the AI replies');
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '0', 'undo did not restore the human turn');

// Autosave and resume.
await playText(page, '画蛇添足');
await waitTurn(page, 0);
await waitChain(page, 3);
const savedBeforeReload = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.idiom-chain.save') || 'null'),
);
assert(savedBeforeReload?.state?.chain?.length >= 3, 'solo game was not autosaved');
const savedChain = savedBeforeReload.state.chain.length;
await page.reload({ waitUntil: 'networkidle' });
assert(await page.getByTestId('continue').isVisible(), 'continue card missing after reload');
await page.getByTestId('continue').click();
await page.waitForSelector('.game-shell');
assert((await page.locator('.chain-entry').count()) === savedChain, 'resume lost the chain');
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '0', 'resume lost the human turn');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
assert(await page.getByTestId('start-solo').isVisible(), 'Escape did not return home');

// Hot-seat cover and handoff privacy.
await page.getByTestId('start-local').click();
await page.getByTestId('begin').click();
await page.waitForTimeout(150);
assert(await page.getByTestId('cover').isVisible(), 'hot-seat cover missing at the start');
assert((await page.locator('.cover-name').innerText()).includes('Player 1'), 'cover names the wrong seat');
await page.getByTestId('cover-reveal').click();
await playText(page, '一心一意');
await page.waitForTimeout(160);
assert(await page.getByTestId('cover').isVisible(), 'cover missing after the turn passed');
assert((await page.locator('.cover-name').innerText()).includes('Player 2'), 'second cover names the wrong seat');
await page.getByTestId('cover-reveal').click();
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '1', 'hot-seat turn did not pass');
await page.getByTestId('undo').click();
await page.waitForTimeout(180);
assert(await page.getByTestId('cover').isVisible(), 'undo did not restore the handoff cover');
await page.getByTestId('cover-reveal').click();
assert((await page.locator('.chain-entry').count()) === 0, 'undo did not clear the hot-seat chain');
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '0', 'undo did not restore the first seat');
await page.getByTestId('home').click();

// A real 10-second timer loses the turn and records a strike.
await page.getByTestId('start-local').click();
assert((await page.getByTestId('cover-toggle').getAttribute('aria-pressed')) === 'true', 'cover should default on');
await page.getByTestId('cover-toggle').click();
await page.getByTestId('timer-10').click();
await page.getByTestId('begin').click();
await page.waitForSelector('.game-shell');
await waitTurn(page, 1, 14000);
assert((await page.locator('.player-card').nth(0).locator('.miss-dot.filled').count()) === 1, 'timer did not add a strike');
assert((await page.getByTestId('timer').innerText()).trim().length > 0, 'timer display missing');
await page.getByTestId('home').click();

// A complete hot-seat game to 10 points, then the family record.
await page.getByTestId('start-local').click();
if ((await page.getByTestId('cover-toggle').getAttribute('aria-pressed')) === 'true') {
  await page.getByTestId('cover-toggle').click();
}
await page.getByTestId('begin').click();
await page.waitForSelector('.game-shell');
for (const text of ['暗箭伤人', '人山人海', '海枯石烂', '烂醉如泥', '泥牛入海']) {
  await playText(page, text);
}
await page.waitForSelector('[data-testid="result"]');
const resultText = await page.getByTestId('result').innerText();
assert(resultText.includes('Player 1 wins'), 'local winner not shown');
assert(resultText.includes('Reached 10 points'), 'score win reason missing');
assert(resultText.includes('5 idioms in the chain'), 'chain length missing from the result');
assert((await page.locator('.final-score').count()) === 2, 'final score rows missing');
const savedRecord = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('familyarcade.idiom-chain.record') || 'null'),
);
assert(savedRecord?.matches === 1, 'record did not count the game');
assert(savedRecord?.localWins === 1, 'record did not count the hot-seat win');
assert(savedRecord?.recent?.[0]?.chain === 5, 'record lost the chain length');
assert(savedRecord?.recent?.[0]?.winnerName === 'Player 1', 'record lost the winner name');
await page.getByTestId('play-again').click();
await page.waitForTimeout(200);
assert((await page.locator('.chain-entry').count()) === 0, 'play again kept the old chain');
assert((await page.locator('.game-shell').getAttribute('data-turn')) === '0', 'play again did not start the first seat');
await page.getByTestId('home').click();
await page.getByTestId('record').click();
assert((await page.getByTestId('record-matches').innerText()).trim() === '1', 'record screen total missing');
assert((await page.locator('.recent-row').count()) === 1, 'recent match row missing');
await page.getByTestId('clear-record').click();
await page.getByTestId('clear-record').click();
assert((await page.getByTestId('record-matches').innerText()).trim() === '0', 'clear record failed');
await page.locator('.screen-top .back').click();

// Fresh Chinese table: no English interface prose, beyond the language switch and pinyin.
const zh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
watch(zh, 'zh');
await prepare(zh, 'zh');
await zh.goto(URL_APP, { waitUntil: 'networkidle' });
assert((await zh.locator('h1').innerText()).includes('成语接龙'), 'Chinese title missing');
const forbidden = /\b(Solo with AI|Pass & play|Same Wi-Fi|Rules|Family record|Sound on|Motion on|Games|Wins|Longest chain|Players|Computer level|Start game|Your turn|Hint|Undo|Pass|Play|Home|Score|Chain|Normal|Hard|Winner|Strikes)\b/;
const chineseBody = async () => (await zh.locator('body').innerText()).replace(/English/g, '');
assert(!forbidden.test(await chineseBody()), 'English leaked into the Chinese home');
await zh.getByTestId('start-solo').click();
assert((await zh.locator('.screen-title').innerText()).includes('牌桌设置'), 'Chinese setup title missing');
assert(!forbidden.test(await chineseBody()), 'English leaked into the Chinese setup');
await zh.getByTestId('begin').click();
await zh.waitForSelector('.game-shell');
assert(!forbidden.test(await chineseBody()), 'English leaked into the Chinese game');
await zh.getByTestId('hint').click();
await zh.waitForSelector('[data-testid="hint-card"]');
assert(/[\u4e00-\u9fff]/.test(await zh.locator('.hint-reason').innerText()), 'Chinese hint reason missing');
await zh.goto(`${URL_APP}&demo=end`, { waitUntil: 'networkidle' });
await zh.waitForSelector('[data-testid="result"]');
const zhResult = await zh.getByTestId('result').innerText();
assert(zhResult.includes('获胜'), 'Chinese result winner missing');
assert(zhResult.includes('先到 10 分'), 'Chinese score reason missing');
assert(!forbidden.test(await chineseBody()), 'English leaked into the Chinese result');

// Phone layout: usable, no overflow, real play.
const mobile = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
watch(mobile, 'mobile');
await prepare(mobile, 'en');
await mobile.goto(URL_APP, { waitUntil: 'networkidle' });
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile home overflows');
await mobile.getByTestId('start-solo').click();
await mobile.getByTestId('players-2').click();
await mobile.getByTestId('begin').click();
await mobile.waitForSelector('.game-shell');
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile game overflows');
assert(await mobile.getByTestId('idiom-input').isVisible(), 'mobile input missing');
await playText(mobile, '一心一意');
await mobile.waitForFunction(
  () => document.querySelector('.game-shell')?.getAttribute('data-turn') === '0',
  null,
  { timeout: 8000 },
);
await waitChain(mobile, 2);
assert((await mobile.locator('.chain-entry').count()) >= 2, 'mobile AI reply missing');
assert((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, 'mobile play overflows');

if (errors.length) throw new Error(`console errors: ${errors.join(' | ')}`);
await browser.close();
console.log(`E2E OK — ${checks} checks: solo, AI, hint reason, undo, autosave, resume, hot-seat cover, timer, full game, record, Chinese UI, keyboard, mobile`);
