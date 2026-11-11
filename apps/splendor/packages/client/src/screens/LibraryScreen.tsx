import { CARDS, COLORS, NOBLES, type CardDef, type Color, type Cost, type NobleDef } from '@splendor/engine';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { CardView } from '../components/CardView';
import { NobleTile } from '../components/NobleTile';
import { T } from '../i18n';
import { useGame } from '../store';
import { GEM_HEX, GEM_NAME, GemIcon, TokenPip } from '../ui/gems';

const NEXT: Record<Color, Color> = { white: 'blue', blue: 'green', green: 'red', red: 'black', black: 'white' };

function rotate(card: CardDef): CardDef {
  const cost: Cost = { white: 0, blue: 0, green: 0, red: 0, black: 0 };
  for (const c of COLORS) cost[NEXT[c]] = card.cost[c];
  return { ...card, bonus: NEXT[card.bonus], cost };
}

function chip(label: string, active: boolean, onClick: () => void, key?: string | number) {
  return (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-all active:scale-95 ${
        active ? 'btn-accent' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'
      }`}
    >
      {label}
    </button>
  );
}

/** 大号贵族牌面（详情页专用，空间充裕不溢出） */
function NobleFace({ noble, size = 176 }: { noble: NobleDef; size?: number }) {
  const reqs = COLORS.filter((c) => noble.requirement[c] > 0);
  return (
    <div
      className="card-face relative grid place-items-center rounded-2xl"
      style={{ width: size, height: size, border: '2px solid var(--color-accent-500)' }}
    >
      <span className="absolute top-2.5 left-2.5 grid h-9 w-9 place-items-center rounded-full bg-ink-900 text-[16px] font-extrabold text-accent-300">
        3
      </span>
      <span className="flex items-center gap-2 pt-3">
        {reqs.map((c) => (
          <TokenPip key={c} color={c} count={noble.requirement[c]} size="lg" />
        ))}
      </span>
    </div>
  );
}

type Detail = { kind: 'card'; card: CardDef } | { kind: 'noble'; noble: NobleDef } | null;

export function LibraryScreen() {
  const setScreen = useGame((s) => s.setScreen);
  const [tier, setTier] = useState<'all' | 1 | 2 | 3>('all');
  const [bonus, setBonus] = useState<'all' | Color>('all');
  const [points, setPoints] = useState<'all' | number>('all');
  const [detail, setDetail] = useState<Detail>(null);

  const filtered = useMemo(
    () =>
      CARDS.filter(
        (c) => (tier === 'all' || c.tier === tier) && (bonus === 'all' || c.bonus === bonus) && (points === 'all' || c.points === points),
      ).sort((a, b) => a.tier - b.tier || a.points - b.points || COLORS.indexOf(a.bonus) - COLORS.indexOf(b.bonus)),
    [tier, bonus, points],
  );
  const allPoints = useMemo(() => [...new Set(CARDS.map((c) => c.points))].sort((a, b) => a - b), []);
  const siblings = useMemo(() => {
    if (!detail || detail.kind !== 'card') return [];
    const out: CardDef[] = [];
    let cur = detail.card;
    for (let i = 0; i < 4; i++) {
      cur = rotate(cur);
      out.push(cur);
    }
    return out;
  }, [detail]);

  return (
    <div className="mx-auto flex min-h-full max-w-[1440px] flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setScreen('menu')} className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400">
          ← {T.menu.back}
        </button>
        <span className="text-[19px] font-extrabold text-ink-900">{T.lib.title}</span>
        <span className="ml-auto text-[11px] text-ink-400">
          {T.library.summary(CARDS.length, NOBLES.length, filtered.length)}
        </span>
      </div>

      {/* 筛选 */}
      <div className="surface flex flex-wrap items-center gap-4 rounded-2xl px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-ink-400">{T.library.tierLabel}</span>
          {chip(T.library.all, tier === 'all', () => setTier('all'))}
          {[1, 2, 3].map((n) => chip(T.lib.tierN(n), tier === n, () => setTier(n as 1 | 2 | 3), n))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-ink-400">{T.library.bonus}</span>
          {chip(T.library.all, bonus === 'all', () => setBonus('all'))}
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={GEM_NAME[c]}
              onClick={() => setBonus(bonus === c ? 'all' : c)}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-all active:scale-95 ${
                bonus === c ? 'border-accent-500 bg-accent-100 text-accent-700' : 'border border-paper-300 bg-white text-ink-500 hover:border-paper-400'
              }`}
            >
              <GemIcon color={c} size={13} />
              {GEM_NAME[c]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-ink-400">{T.library.points}</span>
          {chip(T.library.all, points === 'all', () => setPoints('all'))}
          {allPoints.map((n) => chip(T.library.pointsN(n), points === n, () => setPoints(n), n))}
        </div>
      </div>

      {/* 卡牌网格（点击看详情） */}
      <div className="flex flex-wrap gap-3">
        {filtered.map((c) => (
          <CardView key={c.id} card={c} interactive onClick={() => setDetail({ kind: 'card', card: c })} />
        ))}
        {filtered.length === 0 && <div className="w-full py-16 text-center text-[13px] text-ink-300">{T.library.emptyFilter}</div>}
      </div>

      {/* 贵族（点击看详情，不做悬停预览，避免溢出） */}
      <div className="mt-2">
        <div className="mb-3 text-[13px] font-bold text-ink-700">
          {T.lib.nobles}（{NOBLES.length}）
        </div>
        <div className="flex flex-wrap gap-3">
          {NOBLES.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setDetail({ kind: 'noble', noble: n })}
              className="transition-transform hover:-translate-y-0.5"
              title={T.library.detailTitle}
            >
              <NobleTile noble={n} />
            </button>
          ))}
        </div>
      </div>

      {/* 详情页（卡牌 / 贵族共用外壳） */}
      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center p-4"
            style={{ background: 'rgba(35, 45, 60, 0.45)' }}
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="surface w-full max-w-2xl rounded-2xl p-6"
              style={{ boxShadow: 'var(--shadow-pop)' }}
            >
              {detail.kind === 'card' ? (
                <div className="flex flex-wrap items-start justify-center gap-8">
                  <CardView card={detail.card} />
                  <div className="min-w-[240px]">
                    <div className="text-[16px] font-bold text-ink-900">
                      {T.library.detailTierBonus(detail.card.tier, GEM_NAME[detail.card.bonus])}
                    </div>
                    <div className="mt-1 text-[13px] text-ink-500">{T.library.prestige(detail.card.points > 0 ? `+${detail.card.points}` : T.library.prestigeNone)}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-ink-400">{T.library.costBreak}</span>
                      {COLORS.filter((c) => detail.card.cost[c] > 0).map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 rounded-lg border border-paper-300 bg-white px-2 py-0.5 text-[12px] font-bold text-ink-800">
                          <GemIcon color={c} size={14} />
                          {detail.card.cost[c]} {GEM_NAME[c]}
                        </span>
                      ))}
                    </div>
                    <div className="mt-4 text-[11px] text-ink-400">{T.library.rotatedNote}</div>
                    <div className="mt-2 flex gap-3">
                      {siblings.map((s) => (
                        <div key={`${s.tier}-${s.bonus}`} title={T.game.bonusTitle(GEM_NAME[s.bonus])} className="flex flex-col items-center gap-1">
                          <span className="h-4 w-4 rounded-full border-2" style={{ background: GEM_HEX[s.bonus].soft, borderColor: GEM_HEX[s.bonus].deep }} />
                          <span className="text-[10px] text-ink-400">{GEM_NAME[s.bonus].slice(0, 1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-start justify-center gap-8">
                  <NobleFace noble={detail.noble} />
                  <div className="min-w-[240px]">
                    <div className="text-[16px] font-bold text-ink-900">{detail.noble.name}</div>
                    <div className="mt-1 text-[13px] text-ink-500">{T.library.reputation3}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-ink-400">{T.library.nobleRequirement}</span>
                      {COLORS.filter((c) => detail.noble.requirement[c] > 0).map((c) => (
                        <span key={c} className="inline-flex items-center gap-1 rounded-lg border border-paper-300 bg-white px-2 py-0.5 text-[12px] font-bold text-ink-800">
                          <GemIcon color={c} size={14} />
                          {detail.noble.requirement[c]} {GEM_NAME[c]}
                        </span>
                      ))}
                    </div>
                    <div className="mt-3 text-[11px] leading-relaxed text-ink-400">
                      {T.library.nobleNote}
                    </div>
                  </div>
                </div>
              )}
              <div className="mt-6 text-center">
                <button type="button" onClick={() => setDetail(null)} className="btn-ghost rounded-xl px-5 py-2 text-[12px] font-semibold hover:border-paper-400">
                  {T.common.close}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
