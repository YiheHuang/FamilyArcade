import { COLORS, type NobleDef } from '@splendor/engine';
import { T } from '../i18n';
import { GEM_HEX, GEM_NAME } from '../ui/gems';

/** 要求的小圆片：宝石深色底 + 白色数字（与预定小卡的成本芯片同一套语言） */
function ReqChip({ color, count }: { color: (typeof COLORS)[number]; count: number }) {
  return (
    <span
      className="tnum grid h-[19px] min-w-[21px] place-items-center rounded-[6px] px-[3px] text-[12px] leading-none font-extrabold text-white"
      style={{ background: GEM_HEX[color].deep }}
    >
      {count}
    </span>
  );
}

/**
 * 贵族牌：只有「3」徽章与要求（单行小圆片，最多 3 枚刚好一行；无名称、无悬停详情）。
 */
export function NobleTile({ noble }: { noble: NobleDef }) {
  const reqs = COLORS.filter((c) => noble.requirement[c] > 0);
  return (
    <div
      className="card-face relative grid place-items-center rounded-xl"
      style={{ width: 'var(--noble-s)', height: 'var(--noble-s)', border: '2px solid var(--color-accent-300)' }}
      data-testid="noble-tile"
      data-noble={noble.id}
      title={T.game.nobleReq(noble.name, reqs.map((c) => `${noble.requirement[c]} ${GEM_NAME[c]}`).join(T.game.requirementJoin))}
    >
      <span className="absolute top-0.5 left-0.5 grid h-4 w-4 place-items-center rounded-full bg-ink-900 text-[9px] font-extrabold text-accent-300">
        3
      </span>
      <span className="flex items-center gap-1 pt-2.5">
        {reqs.map((c) => (
          <ReqChip key={c} color={c} count={noble.requirement[c]} />
        ))}
      </span>
    </div>
  );
}

/**
 * 面板上的迷你贵族徽章：收到贵族后永久显示（也是"贵族来访"动画的落点）。
 * 20×26：上方「3」，下方需求色条。
 */
export function NobleBadge({ noble }: { noble: NobleDef }) {
  const reqs = COLORS.filter((c) => noble.requirement[c] > 0);
  return (
    <span
      title={T.game.noblePoints(noble.name)}
      className="grid h-[26px] w-[20px] shrink-0 place-items-center rounded-[6px]"
      style={{ border: '1.5px solid var(--color-accent-300)', background: '#fffdf6' }}
    >
      <span className="text-[8px] leading-none font-extrabold text-accent-700">3</span>
      <span className="flex flex-col items-center gap-[1px]">
        {reqs.map((c) => (
          <span key={c} className="block h-[3px] w-[10px] rounded-full" style={{ background: GEM_HEX[c].deep }} />
        ))}
      </span>
    </span>
  );
}
