#!/usr/bin/env node
/**
 * Scaffold the 20-game arcade from templates/arcade.
 * Run from the repository root: node tools/scaffold-arcade.mjs
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const template = path.join(root, 'templates', 'arcade');

export const GAMES = [
  {
    slug: 'four',
    title: 'Four',
    zh: '四子棋',
    port: 5181,
    description: 'Four in a row on a seven-column board',
    rules: '7 columns × 6 rows. Drop a disc; it falls to the lowest empty cell. First to connect four horizontally, vertically or diagonally wins. A full board is a draw. 2 players.',
    ai: 'Easy random, Normal 2-ply, Hard 5-ply alpha-beta, Companion blocks immediate threats but lets children win sometimes.',
  },
  {
    slug: 'flip',
    title: 'Flip',
    zh: '黑白棋',
    port: 5182,
    description: 'Reversi on an 8×8 board',
    rules: '8×8 Reversi. Black moves first. A move must bracket at least one opponent disc; all bracketed discs flip. If a player has no legal move, turn passes. Game ends when neither can move; most discs wins.',
    ai: 'Corner/edge weights, mobility, frontier; Hard searches 4 plies. Companion avoids taking all corners early.',
  },
  {
    slug: 'draughts',
    title: 'Draughts',
    zh: '国际跳棋',
    port: 5183,
    description: 'English draughts on an 8×8 board',
    rules: 'English draughts: 12 men each on dark squares, diagonal forward moves, mandatory captures, kings move and capture backwards. Win by capturing all pieces or blocking the opponent. 2 players.',
    ai: 'Easy random legal, Normal material + king safety, Hard alpha-beta 5-ply, Companion avoids multi-captures against children.',
  },
  {
    slug: 'mill',
    title: 'Mill',
    zh: '九子棋',
    port: 5184,
    description: 'Nine men’s morris',
    rules: 'Nine men’s morris: place 9 men, then move along lines. Three on a line forms a mill and removes an opponent man (not from a mill unless only mills remain). Win by reducing the opponent to 2 men or blocking all moves. 2 players.',
    ai: 'Placement heuristics, mill threats, mobility; Hard 4-ply. Companion prefers safe moves and avoids repeated captures.',
  },
  {
    slug: 'boxes',
    title: 'Boxes',
    zh: '点格棋',
    port: 5185,
    description: 'Dots and boxes',
    rules: 'A 6×6 grid of dots. Each turn draw one horizontal or vertical edge. Completing the fourth side of a box claims it and grants another turn. Most boxes wins. 2 players.',
    ai: 'Chain/loop awareness; Easy random, Normal avoids the third side, Hard searches endgames, Companion gives away small chains.',
  },
  {
    slug: 'sowing',
    title: 'Sowing',
    zh: '播棋',
    port: 5186,
    description: 'Mancala sowing and capturing',
    rules: 'Two rows of six pits plus a store. On your turn take all stones from one of your pits and sow them one per pit counter-clockwise. Landing in your store grants another turn; landing in an empty pit captures that stone plus the opposite pit. Game ends when one row is empty; most stones wins. 2 players.',
    ai: 'Extra-turn and capture evaluation; Hard 8-ply, Normal 3-ply, Companion favours simple moves.',
  },
  {
    slug: 'tables',
    title: 'Tables',
    zh: '双陆棋',
    port: 5187,
    description: 'Backgammon with dice',
    rules: 'Standard backgammon: 15 checkers each, roll two dice, move checkers toward home, bear off after all are home. Hitting a blot sends it to the bar. Doubling cube is omitted. 2 players.',
    ai: 'Pip-count and blot safety; Easy random, Normal greedy, Hard samples dice, Companion avoids hitting children.',
  },
  {
    slug: 'race-home',
    title: 'Race Home',
    zh: '飞行棋',
    port: 5188,
    description: 'A four-colour race around the house',
    rules: 'Original Ludo-like race: 2–4 players, four pawns each, roll one die. A 6 leaves home and grants another roll. Pawns race around a shared ring into their colour lane. Landing on an opponent sends it home. First to bring all four pawns home wins.',
    ai: 'Priority to entering home, then safe progress; Easy random, Normal greedy, Hard one-ply, Companion avoids sending children home.',
  },
  {
    slug: 'ladder-run',
    title: 'Ladder Run',
    zh: '蛇梯棋',
    port: 5189,
    description: 'Snakes and ladders for the whole family',
    rules: '2–4 players on a 10×10 numbered board. Roll a die and move; ladders climb, snakes slide. Exact roll needed to land on 100. First to 100 wins. No strategy — a family warm-up.',
    ai: 'No decisions; AI rolls automatically. Difficulty changes flavour text only. Companion celebrates every player.',
  },
  {
    slug: 'pair-up',
    title: 'Pair Up',
    zh: '翻牌记忆',
    port: 5190,
    description: 'A memory game with dessert tiles',
    rules: 'A grid of face-down pairs. On your turn flip two tiles; a match stays open and scores, a miss turns back. Most pairs wins. 2–6 players, 4×4 or 6×6 deck.',
    ai: 'Memory of seen cards; Easy forgets, Normal remembers own reveals, Hard remembers all, Companion occasionally “forgets” to give children a chance.',
  },
  {
    slug: 'domino-line',
    title: 'Domino Line',
    zh: '多米诺',
    port: 5191,
    description: 'Block dominoes for 2–4 players',
    rules: 'Double-six dominoes. Each player draws 7 (2 players) or 5 (3–4). Play a tile matching an open end. Draw from the boneyard if stuck. Round ends when someone plays all tiles or nobody can move; pip total of remaining tiles scores for the winner. First to 100 wins the match.',
    ai: 'Hand counting and end control; Hard samples unseen tiles, Companion avoids blocking children.',
  },
  {
    slug: 'color-chain',
    title: 'Color Chain',
    zh: '颜色接龙',
    port: 5192,
    description: 'An original colour-and-number shedding game',
    rules: 'Original UNO-like deck: four colours, numbers 0–9, Skip, Reverse, Draw Two, Wild, Wild Draw Four. Match colour or number. First to empty their hand wins the round; others score the cards left in hand. First to 200 loses? No — lowest score wins the match. 2–6 players.',
    ai: 'Colour-count and next-player threat; Hard samples, Companion avoids stacking draws on children.',
  },
  {
    slug: 'five-dice',
    title: 'Five Dice',
    zh: '五骰',
    port: 5193,
    description: 'A Yahtzee-like dice table',
    rules: 'Five dice, three rolls per turn, keep any dice between rolls. Fill one of 13 categories: ones–sixes, three/four of a kind, full house, small/large straight, five of a kind, chance. Bonus for upper-section 63. Highest total after 13 rounds wins. 2–4 players.',
    ai: 'Expected-value per category; Easy greedily takes the biggest die, Normal uses a simple EV table, Hard computes exact keep probabilities, Companion takes a fun category.',
  },
  {
    slug: 'fleet',
    title: 'Fleet',
    zh: '海战棋',
    port: 5194,
    description: 'Battleship with a hidden fleet',
    rules: 'Each player places a fleet (carrier 5, battleship 4, cruiser 3, submarine 3, destroyer 2) on a 10×10 grid, then alternates shots. Hit/miss/sunk feedback. First to sink the whole fleet wins. 2 players; LAN hides each fleet.',
    ai: 'Hunt/target parity search; Easy random, Normal hunt-target, Hard probability density, Companion fires near children’s misses with a gentle pattern.',
  },
  {
    slug: 'codebreak',
    title: 'Codebreak',
    zh: '猜色',
    port: 5195,
    description: 'Mastermind with coloured pegs',
    rules: 'One player (or the AI) sets a secret 4-peg code from six colours, duplicates allowed. Each guess gets black pegs (right colour and place) and white pegs (right colour, wrong place). Crack it in 10 guesses. 2 players; the code is hidden on the setter’s device.',
    ai: 'Knuth-style minimax for Hard, random consistent guesses for Easy, simple elimination for Normal, Companion gives an extra hint.',
  },
  {
    slug: 'triple-find',
    title: 'Triple Find',
    zh: '三连找',
    port: 5196,
    description: 'A Set-like pattern-spotting game',
    rules: 'A table of 12 cards, each with four attributes (colour, shape, fill, count). A set is three cards where every attribute is all-same or all-different. Find a set; the first caller scores. If nobody calls, add three cards. 2–4 players, 5 minutes.',
    ai: 'Enumerates all sets; Easy slower, Normal human-paced, Hard instant, Companion waits a beat before calling.',
  },
  {
    slug: 'little-go',
    title: 'Little Go',
    zh: '小围棋',
    port: 5197,
    description: '9×9 Go with simple territory scoring',
    rules: '9×9 Go. Black and White alternate placing stones; captures remove groups without liberties. Pass twice ends the game. Score = stones on board + surrounded empty territory; White gets 6.5 komi. No ko rule beyond “no immediate recapture”. 2 players.',
    ai: 'Liberty/atari and influence heuristics; Hard 200 random playouts, Normal 30, Easy greedy, Companion plays away from children’s eyes.',
  },
  {
    slug: 'mini-chess',
    title: 'Mini Chess',
    zh: '迷你棋',
    port: 5198,
    description: 'Chess on a compact 5×6 board',
    rules: 'Original 5×6 chess variant: standard pieces except no queens; pawns promote on the last rank. Check, checkmate and stalemate use standard rules. 2 players.',
    ai: 'Material + piece-square tables; Hard alpha-beta depth 5 with quiescence, Normal depth 2, Easy random, Companion avoids early checks.',
  },
  {
    slug: 'hex',
    title: 'Hex',
    zh: '六角棋',
    port: 5199,
    description: 'The elegant connection game on a hex board',
    rules: '11×11 rhombus of hexagons. Red connects north to south; Blue connects west to east. Players alternate placing one stone. No captures, no draws. 2 players.',
    ai: 'Shortest-path potential; Hard Monte Carlo/union-find search, Normal greedy, Easy random, Companion blocks gently.',
  },
];

function replaceText(file, pairs) {
  const text = readFileSync(file, 'utf8');
  let next = text;
  for (const [from, to] of pairs) next = next.split(from).join(to);
  if (next !== text) writeFileSync(file, next);
}

for (const game of GAMES) {
  const dest = path.join(root, 'apps', game.slug);
  if (existsSync(dest)) {
    console.log(`skip ${game.slug} (exists)`);
    continue;
  }
  cpSync(template, dest, { recursive: true });
  for (const dir of ['docs/screenshots/en', 'docs/screenshots/zh', 'docs/promo']) {
    mkdirSync(path.join(dest, dir), { recursive: true });
  }
  const replacements = [
    ['@family-arcade/triple', `@family-arcade/${game.slug}`],
    ['Triple — a tiny tic-tac-toe for family game night', game.description],
    ['familyarcade.triple', `familyarcade.${game.slug}`],
    ['com.familyarcade.triple', `com.familyarcade.${game.slug}`],
    ['familyarcade-triple', `familyarcade-${game.slug}`],
    ['familyarcade_triple', `familyarcade_${game.slug.replaceAll('-', '_')}`],
    ['Triple failed to start', `${game.title} failed to start`],
    ['5180', String(game.port)],
    ['4180', String(game.port - 1000)],
    ['三连棋', game.zh],
    ['Three in a row. One small table.', game.description],
    ['Triple', game.title],
    ['triple', game.slug],
  ];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(json|ts|tsx|mjs|html|md|toml|css)$/.test(entry)) replaceText(full, replacements);
    }
  };
  walk(dest);
  // Restore a neutral icon filename; all games share the Family Arcade icon.
  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = `@family-arcade/${game.slug}`;
  pkg.description = game.description;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const brief = `# ${game.title} · ${game.zh}

**Family Arcade game ${game.port - 5179}/27 · slug \`${game.slug}\` · dev port ${game.port}**

${game.description}

## Rules to implement

${game.rules}

## AI

${game.ai}

## Non-negotiable deliverables

- Pure deterministic engine in \`src/game/\` with at least 20 unit tests.
- 4 AI levels (Companion / Easy / Normal / Hard), deterministic with injected RNG.
- Hot-seat + solo + LAN. Use \`@family-arcade/lan\` exactly like the Triple reference.
- Real zh/en UI, sound toggle, undo, hint, autosave/resume, local family record.
- Real screenshots in \`docs/screenshots/{en,zh}\` (1440×1000; mobile 780×1688).
- \`docs/rules.md\`, \`docs/limitations.md\`, \`NOTICE.md\`, \`LICENSE\`, bilingual READMEs.
- Update \`video.json\` with eight narration lines, facts, tagline and screenshots.
- \`npm run check\` green and \`node scripts/e2e.mjs\` passing (start \`npm run dev\` first).
- Keep the Tauri shell and \`cargo build\` working; do not remove LAN.
`;
  writeFileSync(path.join(dest, 'APP_BRIEF.md'), brief);
  console.log(`scaffolded ${game.slug}`);
}
