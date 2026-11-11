// 卡牌数据源解析库：把 5 种不同格式的原始快照解析为统一的卡牌/贵族结构
// 供 reconcile.mjs（核对分析）与 finalize-data.mjs（定稿生成）共用。

export const COLORS = ['white', 'blue', 'green', 'red', 'black'];
export const LETTER = { white: 'W', blue: 'U', green: 'G', red: 'R', black: 'K' };
/** 官方旋转环：white -> blue -> green -> red -> black -> white */
export const NEXT = { white: 'blue', blue: 'green', green: 'red', red: 'black', black: 'white' };

export function cost(white = 0, blue = 0, green = 0, red = 0, black = 0) {
  return { white, blue, green, red, black };
}

export function costEquals(a, b) {
  return COLORS.every((c) => (a[c] || 0) === (b[c] || 0));
}

export function sig(card) {
  const parts = COLORS.map((c) => card.cost[c] || 0).filter((n) => n > 0).sort((a, b) => b - a);
  return parts.length ? parts.join('+') : '0';
}

export function costStr(card) {
  const parts = COLORS.filter((c) => (card.cost[c] || 0) > 0).map((c) => `${LETTER[c]}${card.cost[c]}`);
  return parts.length ? parts.join(' ') : '-';
}

export function cardKey(card) {
  return `${card.tier}|${card.bonus}|${card.points}|${sig(card)}`;
}

export function cardStr(card) {
  return `T${card.tier} ${LETTER[card.bonus]} ${card.points}分 [${costStr(card)}]`;
}

export function sameCard(a, b) {
  return a.tier === b.tier && a.bonus === b.bonus && a.points === b.points && costEquals(a.cost, b.cost);
}

/** 沿官方旋转环旋转整张卡（加成色与成本色同时 +1） */
export function rotate(card) {
  const c = cost();
  for (const color of COLORS) c[NEXT[color]] = card.cost[color] || 0;
  return { tier: card.tier, bonus: NEXT[card.bonus], points: card.points, cost: c };
}

// ---------------- parsers ----------------

export function parseBoardgamers(text) {
  const cards = [];
  const cardRe = /\[(\d),\s*"(\w+)",\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g;
  const bonusMap = { onyx: 'black', sapphire: 'blue', diamond: 'white', emerald: 'green', ruby: 'red' };
  let m;
  while ((m = cardRe.exec(text))) {
    cards.push({
      tier: +m[1],
      bonus: bonusMap[m[2]],
      points: +m[3],
      cost: cost(+m[4], +m[5], +m[6], +m[7], +m[8]),
    });
  }
  const nobles = [];
  const nobleRe = /\["([^"]+)",\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\]/g;
  while ((m = nobleRe.exec(text))) {
    nobles.push({ name: m[1], req: cost(+m[2], +m[3], +m[4], +m[5], +m[6]) });
  }
  return { cards, nobles };
}

export function parseSplendimax(text) {
  const cards = [];
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const f = line.split(',').map((s) => s.trim());
    if (f.length < 8 || !f[0]) continue;
    cards.push({
      tier: +f[0],
      bonus: f[1].toLowerCase(),
      points: +f[2],
      cost: cost(+(f[7] || 0), +(f[4] || 0), +(f[5] || 0), +(f[6] || 0), +(f[3] || 0)), // 表头：Black,Blue,Green,Red,White
    });
  }
  return { cards };
}

export function parseSplendimaxNobles(text) {
  const nobles = [];
  const re = /create_noble\((\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/g;
  let m;
  while ((m = re.exec(text))) {
    nobles.push({ name: null, req: cost(+m[5], +m[2], +m[3], +m[4], +m[1]) }); // 参数序：black,blue,green,red,white
  }
  return nobles;
}

export function parseSeal256(text) {
  const cards = [];
  const lines = text.trim().split(/\r?\n/);
  const gemMap = { k: 'black', b: 'blue', w: 'white', g: 'green', r: 'red' };
  for (const line of lines.slice(1)) {
    const f = line.split(',').map((s) => s.trim());
    if (f.length < 4 || !f[0]) continue;
    const [level, gem, pv, r, g, b, w, k] = f;
    cards.push({
      tier: +level,
      bonus: gemMap[gem],
      points: +pv,
      cost: cost(+(w || 0), +(b || 0), +(g || 0), +(r || 0), +(k || 0)),
    });
  }
  return { cards };
}

export function parseGoldenchicken(text) {
  const data = JSON.parse(text);
  const map = { WHITE: 'white', BLUE: 'blue', GREEN: 'green', RED: 'red', BLACK: 'black' };
  const cards = [];
  for (const block of data.deck) {
    for (const [levelKey, list] of Object.entries(block)) {
      const tier = +levelKey.replace('level', '');
      for (const c of list) {
        const co = cost();
        for (const [k, v] of Object.entries(c.price)) co[map[k]] = +v;
        cards.push({ tier, bonus: map[c.color], points: +c.score, cost: co });
      }
    }
  }
  const nobles = data.noble.map((n) => {
    const req = cost();
    for (const [k, v] of Object.entries(n.price)) req[map[k]] = +v;
    return { name: null, req };
  });
  return { cards, nobles };
}

export function parseAnicolao(text) {
  // id 前缀为加成色；列为 prestige_points,white,blue,green,red,black
  const cards = [];
  const lines = text.trim().split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const f = line.split(',').map((s) => s.trim());
    if (f.length < 7 || !f[0]) continue;
    const [id, pts, w, b, g, r, k] = f;
    const [bonus, lvl] = id.split('-');
    cards.push({ tier: +lvl.slice(1), bonus, points: +pts, cost: cost(+w, +b, +g, +r, +k) });
  }
  return { cards };
}
