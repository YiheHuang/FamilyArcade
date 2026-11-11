// 消融实验：对比困难档的几组参数（每组 120 局）
import { AI_SPECS, aiAgent, runGame } from '@splendor/engine';

const N = Number(process.argv[2] ?? 120);

async function duel(hardPatch, label) {
  const backup = { ...AI_SPECS.hard, weights: { ...AI_SPECS.hard.weights } };
  Object.assign(AI_SPECS.hard, hardPatch);
  if (hardPatch.weights) AI_SPECS.hard.weights = { ...backup.weights, ...hardPatch.weights };
  let hardWins = 0;
  let normalWins = 0;
  let draws = 0;
  for (let g = 0; g < N; g++) {
    const rotate = g % 2 === 1;
    const levels = rotate ? ['normal', 'hard'] : ['hard', 'normal'];
    const configs = levels.map((lv) => ({ name: lv, kind: 'ai', aiLevel: lv }));
    const res = runGame(configs, { seed: `abl-${label}-${g}` }, levels.map((lv) => aiAgent(lv)));
    if (res.error) continue;
    if (res.state.winners.length > 1) draws++;
    else if (levels[res.state.winners[0]] === 'hard') hardWins++;
    else normalWins++;
  }
  Object.assign(AI_SPECS.hard, backup);
  AI_SPECS.hard.weights = backup.weights;
  const total = hardWins + normalWins + draws;
  console.log(`${label.padEnd(34)} 困难 ${((hardWins / total) * 100).toFixed(0)}% : 普通 ${((normalWins / total) * 100).toFixed(0)}%（平 ${draws}）`);
}

await duel({ noise: 0.05, topK: 5, weights: { denial: 0.9, engine: 0.85, rush: 1.2 } }, 'A: 当前(基建0.85/冲刺1.2/防守0.9)');
await duel({ noise: 0.05, topK: 5, weights: { denial: 0.6, engine: 1.0, rush: 1.1 } }, 'B: 均衡偏高(1.0/1.1/0.6)');
await duel({ noise: 0.05, topK: 5, weights: { denial: 0.6, engine: 1.15, rush: 1.0 } }, 'C: 偏基建(1.15/1.0/0.6)');
await duel({ noise: 0.05, topK: 5, weights: { denial: 0.8, engine: 1.3, rush: 0.95 } }, 'D: 强基建(1.3/0.95/0.8)');
await duel({ noise: 0.05, topK: 5, weights: { denial: 0.4, engine: 1.0, rush: 1.35 } }, 'E: 极端冲刺(1.0/1.35/0.4)');
