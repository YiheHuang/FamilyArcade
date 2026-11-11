import { COLORS, type Color, type Tokens } from '@splendor/engine';
import { T } from '../i18n';
import { GEM_HEX, GEM_NAME, GemIcon } from '../ui/gems';

/**
 * 宝石供给区（不含文字标签：图标 + 数量足矣）
 * 选中态用"双像素琥珀边框 + 上浮 + 阴影"表达，且不被 hover 样式覆盖。
 */
function Pile({
  color,
  count,
  selected,
  takeTwo,
  canAct,
  canTakeTwo,
  onToggle,
  onTakeTwo,
}: {
  color: Color;
  count: number;
  selected: boolean;
  takeTwo: boolean;
  canAct: boolean;
  canTakeTwo: boolean;
  onToggle: (c: Color) => void;
  onTakeTwo: (c: Color | null) => void;
}) {
  const selectable = canAct && count > 0;
  const active = selected || takeTwo;
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="gem-pile"
        data-gem={color}
        data-sfx="off"
        title={T.game.gemPileTitle(GEM_NAME[color], count)}
        onClick={selectable ? () => onToggle(color) : undefined}
        onDoubleClick={canTakeTwo ? () => onTakeTwo(color) : undefined}
        disabled={!selectable}
        className={`flex w-[var(--pile-w)] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 transition-all duration-150 ease-out ${
          active
            ? '-translate-y-1.5 border-accent-500 bg-accent-100 shadow-[0_8px_18px_-8px_rgba(201,147,46,0.65)]'
            : 'border-paper-300 bg-white hover:-translate-y-0.5 hover:border-paper-400'
        } ${selectable ? 'active:scale-95' : 'cursor-default opacity-45 hover:translate-y-0 hover:border-paper-300'}`}
        style={{ height: 'var(--pile-h)' }}
      >
        <GemIcon color={color} size={26} />
        <span className="tnum text-[18px] leading-none font-extrabold text-ink-900">{count}</span>
      </button>
      {canTakeTwo && (
        <button
          type="button"
          data-sfx="off"
          title={T.game.takeTwoLabel}
          onClick={() => onTakeTwo(takeTwo ? null : color)}
          className={`absolute -top-2 right-1 rounded-full border px-1.5 py-[1px] text-[10px] font-bold transition-colors ${
            takeTwo ? 'border-accent-600 bg-accent-500 text-white' : 'border-paper-300 bg-white text-accent-700 hover:border-accent-300'
          }`}
          style={takeTwo ? {} : { boxShadow: '0 1px 2px rgba(28,39,58,0.12)' }}
        >
          ×2
        </button>
      )}
    </div>
  );
}

export function TokenBank({
  bank,
  selected,
  takeTwo,
  canAct,
  onToggle,
  onTakeTwo,
}: {
  bank: Tokens;
  selected: Color[];
  takeTwo: Color | null;
  canAct: boolean;
  onToggle: (c: Color) => void;
  onTakeTwo: (c: Color | null) => void;
}) {
  return (
    <div className="token-bank flex items-center gap-2">
      {COLORS.map((c) => (
        <Pile
          key={c}
          color={c}
          count={bank[c]}
          selected={selected.includes(c)}
          takeTwo={takeTwo === c}
          canAct={canAct}
          canTakeTwo={canAct && bank[c] >= 4}
          onToggle={onToggle}
          onTakeTwo={onTakeTwo}
        />
      ))}
      <div className="mx-1 w-px bg-paper-300" style={{ height: 'calc(var(--pile-h) - 14px)' }} />
      <div
        title={T.game.goldPileTitle}
        className="flex w-[64px] cursor-default flex-col items-center justify-center gap-1 rounded-xl border-2"
        style={{ height: 'var(--pile-h)', borderColor: 'var(--color-accent-300)', background: 'var(--color-accent-100)' }}
      >
        <GemIcon color="gold" size={26} />
        <span className="tnum text-[18px] leading-none font-extrabold text-accent-700">{bank.gold}</span>
      </div>
    </div>
  );
}
