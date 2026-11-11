// WebSocket 服务器冒烟测试：两个真实 ws 客户端完成 创建→加入→开局→行动 全流程
import WebSocket from 'ws';

const URL = process.env.WS_URL ?? 'ws://localhost:8081/ws';
const results = [];
function ok(name, cond) {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name}`);
}

function client() {
  const ws = new WebSocket(URL);
  const inbox = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data));
    inbox.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].predicate(msg)) {
        waiters[i].resolve(msg);
        waiters.splice(i, 1);
      }
    }
  });
  ws.on('error', (e) => console.error('ws error', e.message));
  return {
    ws,
    send: (msg) => ws.send(JSON.stringify(msg)),
    waitFor: (predicate, timeoutMs = 4000) =>
      new Promise((resolve, reject) => {
        const hit = inbox.find(predicate);
        if (hit) return resolve(hit);
        const timer = setTimeout(() => reject(new Error('等待消息超时')), timeoutMs);
        waiters.push({
          predicate,
          resolve: (m) => {
            clearTimeout(timer);
            resolve(m);
          },
        });
      }),
    close: () => ws.close(),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const a = client();
  const b = client();
  await a.waitFor((m) => m.t === 'welcome');
  await b.waitFor((m) => m.t === 'welcome');
  ok('双方收到 welcome（含局域网地址）', true);

  a.send({ t: 'create', name: '爸爸', seatCount: 2 });
  const roomA = await a.waitFor((m) => m.t === 'room');
  const code = roomA.code;
  ok(`创建房间成功（房间码 ${code}）`, /^[A-Z2-9]{4}$/.test(code));

  b.send({ t: 'join', code, name: '孩子' });
  const roomB = await b.waitFor((m) => m.t === 'room');
  ok('第二位玩家加入成功', roomB.seats[1].kind === 'human' && roomB.seats[1].connected);
  await a.waitFor((m) => m.t === 'room' && m.seats[1].connected);
  ok('房主看到座位状态更新', true);

  a.send({ t: 'start' });
  const stateA = await a.waitFor((m) => m.t === 'state');
  ok('开局后收到脱敏视图（牌堆只有数量）', Array.isArray(stateA.view.deckCounts) && stateA.view.deckCounts.length === 3);
  ok('开局棋盘有 12 张明牌', stateA.view.board.flat().filter((x) => x != null).length === 12);

  a.send({ t: 'move', move: { type: 'take', colors: ['white', 'blue', 'green'] } });
  const stateB = await b.waitFor((m) => m.t === 'state' && m.view.players[0].tokens.white === 1);
  ok('行动同步到对手视角', stateB.view.current === 1);
  ok('对手看不到我方牌堆内容', !('decks' in stateB.view) || !Array.isArray(stateB.view.decks));

  b.send({ t: 'move', move: { type: 'take', colors: ['white'] } });
  const finalA = await a.waitFor((m) => m.t === 'state' && m.view.current === 0 && m.view.players[1].tokens.white === 1);
  ok('回合交还房主', finalA.view.players[1].tokens.white === 1);

  a.close();
  b.close();
  await sleep(100);
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n❌ ${failed.length} 项失败` : '\n🎉 WebSocket 冒烟测试全部通过');
  process.exit(failed.length ? 1 : 0);
} catch (err) {
  console.error('❌ 冒烟测试异常：', err.message);
  process.exit(1);
}
