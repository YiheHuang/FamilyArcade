import { motion } from 'motion/react';
import { T } from '../i18n';
import { useGame } from '../store';

/** 极简行内标记渲染：**粗体** 与 `代码` */
function RText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) {
          return (
            <b key={i} className="font-bold text-ink-900">
              {p.slice(2, -2)}
            </b>
          );
        }
        if (p.startsWith('`') && p.endsWith('`')) {
          return (
            <code key={i} className="rounded bg-paper-100 px-1 py-0.5 text-[11.5px] text-ink-700">
              {p.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="surface rounded-2xl p-4">
      <div className="text-[13px] font-black text-ink-900">{title}</div>
      <ul className="mt-2 space-y-1.5 pl-4">
        {items.map((item, i) => (
          <li key={i} className="list-disc text-[12.5px] leading-relaxed text-ink-600">
            <RText text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RulesScreen() {
  const back = useGame((s) => s.backToMenu);
  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1080px] flex-col px-6 py-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => back()} className="btn-ghost rounded-lg px-2.5 py-1.5 text-[12px] font-semibold hover:border-paper-400">
          ← {T.common.backShort}
        </button>
        <span className="text-[19px] font-extrabold text-ink-900">{T.rules.title}</span>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 grid gap-3 md:grid-cols-2">
        {T.rules.sections.map((sec) => (
          <Section key={sec.title} title={sec.title} items={sec.items} />
        ))}
      </motion.div>
    </div>
  );
}
