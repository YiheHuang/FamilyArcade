import { useEffect, useRef } from 'react';
import { T } from '../i18n';

export interface LogLine {
  text: string;
  /** 重点行（最后回合 / 终局）：加粗强调 */
  strong?: boolean;
}

export function GameLog({ lines }: { lines: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.scrollTo !== 'function') return;
    try {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    } catch {
      /* ignore */
    }
  }, [lines.length]);
  return (
    <div ref={ref} className="h-full overflow-y-auto p-3 text-[12px] leading-relaxed">
      {lines.length === 0 && <div className="text-ink-300">{T.game.noLog}</div>}
      {lines.map((l, i) => (
        <div
          key={i}
          className={`border-b border-paper-100 py-1 last:border-0 ${l.strong ? 'font-bold text-accent-700' : 'text-ink-500'}`}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}
