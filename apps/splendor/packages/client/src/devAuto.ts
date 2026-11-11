/**
 * 开发用自动场景：通过 URL 参数直接进入某个界面/局面，便于截图与自查。
 * 例：
 *   /?screen=library                 打开卡牌库
 *   /?dev=game&scene=reserved        进入对局并摆好「预定区」场景
 *   /?dev=game&scene=midgame&players=4
 *   /?dev=game&scene=endgame
 * 仅在带参数时生效，正常游玩不受影响。
 */
import {
  applyMove,
  chooseMove,
  COLORS,
  NOBLES,
  setupGame,
  viewFor,
  type AiLevel,
  type GameState,
  type Move,
  type TokenColor,
} from '@splendor/engine';
import { useGame, type SeatConfig } from './store';
import { fromClientState, localView } from './view';

function seatsFor(players: number, aiLevel: AiLevel, human = false): SeatConfig[] {
  // dev-only: ?names=Dad,Mom,Mia,Leo lets the promo capture the real UI in English
  const custom = (new URLSearchParams(window.location.search).get("names") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from({ length: players }, (_, i) => ({
    kind: i === 0 && human ? "human" : "ai",
    aiLevel,
    name: custom[i] ?? (i === 0 ? "多多" : ["糖糖", "果果", "团团"][i - 1] ?? `玩家${i + 1}`),
  }));
}

function pushState(state: GameState, seats: SeatConfig[]): void {
  useGame.setState({
    screen: 'game',
    mode: 'local',
    game: state,
    view: localView(state),
    seats,
    history: [],
    events: [{ type: 'turn-start', seat: state.current }],
    popup: null,
    selected: [],
    takeTwo: null,
  });
}

function playAi(state: GameState, count: number, level: AiLevel): GameState {
  let s = state;
  for (let i = 0; i < count; i++) {
    if (s.phase === 'ended') break;
    const move = chooseMove(s, level);
    const res = applyMove(s, move);
    if (res.error) break;
    s = res.state;
  }
  return s;
}

function apply(state: GameState, move: Move): GameState {
  const res = applyMove(state, move);
  return res.error ? state : res.state;
}

/** 收尾：自动处理归还 / 贵族选择，方便截图时保持干净的局面 */
function resolvePending(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase !== 'playing' && s.phase !== 'ended' && guard++ < 20) {
    if (s.phase === 'discarding') {
      const pl = s.players[s.current]!;
      let left = COLORS.reduce((a, c) => a + pl.tokens[c], 0) + pl.tokens.gold - 10;
      const tokens: Partial<Record<TokenColor, number>> = {};
      for (const c of ['gold', 'black', 'red', 'green', 'blue', 'white'] as const) {
        if (left <= 0) break;
        const take = Math.min(pl.tokens[c], left);
        if (take > 0) {
          tokens[c] = take;
          left -= take;
        }
      }
      s = apply(s, { type: 'discard', tokens });
    } else if (s.phase === 'choosing-noble') {
      const options = (s.pending as { options: number[] }).options;
      s = apply(s, { type: 'chooseNoble', nobleId: options[0]! });
    }
  }
  return s;
}

/** 生成两条演示对局记录（仅开发/自动化用） */
async function seedDemoRecords(): Promise<void> {
  const { setupGame, chooseMove, applyMove, totalPoints } = await import('@splendor/engine');
  const { saveRecord } = await import('./records');
  // 家庭演示数据：一场 2 人（爸爸 vs 妈妈）与五场 3 人（+ 电脑），让战绩页有真实排行榜
  const lineups: Array<{ mode: 'local' | 'ai'; level: 'friendly' | 'normal' | 'hard'; names: string[] }> = [
    { mode: 'local', level: 'normal', names: ['爸爸', '妈妈'] },
    { mode: 'ai', level: 'friendly', names: ['爸爸', '糖果', '电脑1'] },
    { mode: 'ai', level: 'normal', names: ['妈妈', '爸爸', '电脑1'] },
    { mode: 'local', level: 'normal', names: ['爸爸', '妈妈', '糖果'] },
    { mode: 'ai', level: 'hard', names: ['糖果', '妈妈', '电脑1'] },
    { mode: 'ai', level: 'normal', names: ['爸爸', '糖果', '妈妈'] },
  ];
  let i = 0;
  for (const line of lineups) {
    const seats = line.names.map((name, k) => ({
      name,
      kind: (name.startsWith('电脑') ? 'ai' : 'human') as 'human' | 'ai',
      aiLevel: line.level,
    }));
    const seed = `demo-${i}-${Date.now()}`;
    let state = setupGame(seats, { seed });
    const moves: import('@splendor/engine').Move[] = [];
    let guard = 0;
    while (state.phase !== 'ended' && guard++ < 800) {
      const move = chooseMove(state, line.level);
      const res = applyMove(state, move);
      if (res.error) break;
      moves.push(move);
      state = res.state;
    }
    const minutesAgo = (lineups.length - i) * 17;
    await saveRecord({
      id: `demo-${i}-${Date.now()}`,
      mode: line.mode,
      createdAt: Date.now() - minutesAgo * 60_000 - 22 * 60_000,
      finishedAt: Date.now() - minutesAgo * 60_000,
      seats,
      seed,
      moves,
      winners: state.winners ?? [],
      points: state.players.map((p) => totalPoints(p)),
      turns: state.turn,
    });
    i += 1;
  }
}

export function maybeRunDevAuto(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const screen = params.get('screen');
  if (screen === 'library' || screen === 'menu' || screen === 'lobby' || screen === 'rules' || screen === 'settings' || screen === 'records') {
    useGame.setState({ screen });
  }
  const dev = params.get('dev');
  if (!dev) return;
  if (dev === 'records') {
    void seedDemoRecords().then(() => useGame.setState({ screen: 'records' }));
    return;
  }
  const players = Math.min(4, Math.max(2, Number(params.get('players') ?? 2)));
  const seed = params.get('seed') ?? 'dev-shot';
  const aiLevel = (params.get('ai') ?? 'normal') as AiLevel;
  const scene = params.get('scene') ?? 'default';
  // 需要展示弹窗的场景强制第一个座位为人类（否则 AI 会自动处理）
  const human = params.get('human') === '1' || scene === 'discard' || scene === 'noble';
  const seats = seatsFor(players, aiLevel, human);

  let state = setupGame(seats.map((s) => ({ name: s.name, kind: s.kind, aiLevel: s.aiLevel })), { seed });

  if (scene === 'fresh') {
    // 全新开局（用于查看初始牌桌 / 牌堆交互）
  } else if (scene === 'default') {
    state = playAi(state, 16, aiLevel);
  } else if (scene === 'midgame') {
    state = playAi(state, 46, aiLevel);
  } else if (scene === 'reserved') {
    // 让 P0 连预定 3 张（其中包含三级大牌），用于检查预定区信息展示
    const reserve = (tier: 1 | 2 | 3, slot: number): void => {
      state = apply(state, { type: 'reserve', target: { kind: 'board', tier, slot } });
      // 换人回合
      const p = state.players[state.current]!;
      const takeColors = ['white', 'blue', 'green', 'red', 'black'].filter((c) => state.bank[c as 'white'] > 0).slice(0, 3);
      if (takeColors.length > 0 && state.phase === 'playing') {
        state = apply(state, { type: 'take', colors: takeColors as ('white' | 'blue' | 'green' | 'red' | 'black')[] });
      }
      void p;
    };
    state = playAi(state, 10, aiLevel);
    const startSeat = state.current;
    // 保证轮次回到 P0 再操作
    let guard = 0;
    while (state.current !== startSeat && guard++ < 10 && state.phase !== 'ended') {
      state = playAi(state, 1, aiLevel);
    }
    reserve(3, 0);
    reserve(2, 0);
    reserve(1, 0);
    state = resolvePending(state);
  } else if (scene === 'discard') {
    state = playAi(state, 14, aiLevel);
    // 直接构造「手上 12 枚、需要归还」的局面（开发场景专用）
    let guard = 0;
    while (state.current !== 0 && state.phase !== 'ended' && guard++ < 20) state = playAi(state, 1, aiLevel);
    const p = state.players[0]!;
    p.tokens = { white: 4, blue: 4, green: 3, red: 1, black: 0, gold: 0 };
    state.phase = 'discarding';
    state.pending = { player: 0, total: 12 };
  } else if (scene === 'noble') {
    state = playAi(state, 12, aiLevel);
    let guard = 0;
    while (state.current !== 0 && guard++ < 20 && state.phase !== 'ended') state = playAi(state, 1, aiLevel);
    const nobleP = state.players[0]!;
    // 让前两位贵族的要求都得到满足，直接进入「选择贵族」阶段（开发场景专用）
    const [n1, n2] = state.nobles;
    if (n1 != null && n2 != null) {
      for (const nobleId of [n1, n2]) {
        const noble = NOBLES.find((n) => n.id === nobleId);
        if (!noble) continue;
        for (const c of COLORS) nobleP.bonuses[c] = Math.max(nobleP.bonuses[c], noble.requirement[c]);
      }
      state.phase = 'choosing-noble';
      state.pending = { player: 0, options: [n1, n2] };
    }
  } else if (scene === 'endgame') {
    let guard = 0;
    while (state.phase !== 'ended' && guard++ < 600) {
      state = apply(state, chooseMove(state, aiLevel));
    }
  } else if (scene === 'lanview') {
    // 模拟局域网视图：对手的盲抽预定显示为卡背，顶栏显示房间码
    state = playAi(state, 26, aiLevel);
    // 让对手做一次盲抽预定，展示"卡背"效果（先清空其预定位，仅用于截图演示）
    state.players[1]!.reserved = [];
    if (state.current === 1 && state.phase === 'playing') {
      state = apply(state, { type: 'reserve', target: { kind: 'deck', tier: 1 } });
    } else {
      state.current = 1;
      state.phase = 'playing';
      state = apply(state, { type: 'reserve', target: { kind: 'deck', tier: 1 } });
      state.current = 0;
    }
    state = resolvePending(state);
    const clientView = viewFor(state, 0, { hideReserved: true });
    useGame.setState({
      screen: 'game',
      mode: 'lan',
      game: null,
      view: fromClientState(clientView),
      seats: [],
      history: [],
      events: [],
      popup: null,
      selected: [],
      takeTwo: null,
      lan: {
        code: '8K2M',
        you: 0,
        spectator: false,
        hostSeat: 0,
        seats: [
          { seat: 0, kind: 'human', name: '多多', connected: true },
          { seat: 1, kind: 'human', name: '糖糖', connected: false, autoPlaying: true },
        ],
        started: true,
      },
      lanConnected: true,
    });
    return;
  }

  // 开发场景：nogold=1 把银行金币清零，用于检查「金币已空」时的气泡文案（官方规则：无金币仍可预定）
  if (params.get('nogold') === '1') {
    state.bank.gold = 0;
  }

  // 开发场景：turnsecs=6 设定本局思考时间；rushed/overtime 直接把截止时刻拨到告急/超时（用于截图与断言）
  if (params.get('turnsecs') != null) {
    const sec = Number(params.get('turnsecs')) || 0;
    const dead = sec > 0 ? Date.now() + sec * 1000 : null;
    if (params.get('rushed') === '1') useGame.setState({ turnLimitSec: sec, turnDeadline: Date.now() + 3000 });
    else if (params.get('overtime') === '1') useGame.setState({ turnLimitSec: sec, turnDeadline: Date.now() - 12000 });
    else useGame.setState({ turnLimitSec: sec, turnDeadline: dead });
  }

  pushState(state, seats);
}
