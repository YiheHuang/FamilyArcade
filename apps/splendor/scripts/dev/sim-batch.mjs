// AI 批量对战校准：跑多组固定对局并在表格中打印胜率/平均回合
// 用法：node scripts/dev/sim-batch.mjs [每组局数，默认 40]
import { aiAgent, runGame, totalPoints } from '@splendor/engine';

const gamesPerMatch = Number(process.argv[2] ?? 40);

const matchups = [
  { name: '困难 vs 普通', seats: ['hard', 'normal'] },
  { name: '困难 vs 简单', seats: ['hard', 'easy'] },
  { name: '普通 vs 简单', seats: ['normal', 'easy'] },
  { name: '普通 vs 陪玩', seats: ['normal', 'friendly'] },
  { name: '简单 vs 陪玩', seats: ['easy', 'friendly'] },
  { name: '困难 vs 普通 vs 简单', seats: ['hard', 'normal', 'easy'] },
];

console.log(`每组 ${gamesPerMatch} 局（2 人局交替先手，3 人局固定顺序）\n`);
console.log('对局'.padEnd(28) + '座位胜率'.padEnd(34) + '平局  平均回合  平均比分');
console.log('─'.repeat(96));

for (const m of matchups) {
  const wins = m.seats.map(() => 0);
  let draws = 0;
  let turns = 0;
  let scoreSum = 0;
  let games = 0;
  for (let g = 0; g < gamesPerMatch; g++) {
    const rotate = m.seats.length === 2 && g % 2 === 1;
    const levels = rotate ? [m.seats[1], m.seats[0]] : [...m.seats];
    const configs = levels.map((lv, i) => ({ name: `${i + 1}号(${lv})`, kind: 'ai', aiLevel: lv }));
    const agents = levels.map((lv) => aiAgent(lv));
    const res = runGame(configs, { seed: `sim-${m.name}-${g}` }, agents);
    if (res.error) {
      console.log(`  ❌ 第 ${g} 局异常：${res.error}`);
      continue;
    }
    const st = res.state;
    games++;
    turns += Math.max(...st.turnsTaken);
    for (const p of st.players) scoreSum += totalPoints(p);
    if (st.winners.length > 1) draws++;
    else {
      const w = st.winners[0];
      if (rotate && m.seats.length === 2) wins[w === 0 ? 1 : 0]++;
      else wins[w]++;
    }
  }
  const rates = wins
    .map((w, i) => `${m.seats[i]}: ${((w / games) * 100).toFixed(0)}%`)
    .join('  ');
  const avgScore = (scoreSum / (games * m.seats.length)).toFixed(1);
  console.log(m.name.padEnd(28) + rates.padEnd(34) + String(draws).padEnd(6) + String((turns / games).toFixed(1)).padEnd(10) + avgScore);
}
console.log('\n（胜率接近 50% 说明两档强度接近；用于调整评估权重）');
