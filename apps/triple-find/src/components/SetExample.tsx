import { setReason, type Attribute, type Card, type SetRelation } from '../game/cards';
import { t, type Lang, type MessageKey } from '../i18n';
import { CardFace } from './CardFace';

/** A fixed valid set used in the hero, setup and rules screens. */
export const EXAMPLE_SET: [Card, Card, Card] = [
  { id: 9001, color: 0, shape: 1, fill: 0, count: 1 },
  { id: 9002, color: 1, shape: 0, fill: 1, count: 2 },
  { id: 9003, color: 2, shape: 2, fill: 2, count: 3 },
];

const ATTR_KEYS: Record<Attribute, MessageKey> = {
  color: 'attrColor',
  shape: 'attrShape',
  fill: 'attrFill',
  count: 'attrCount',
};

const REL_KEYS: Record<SetRelation, MessageKey> = {
  same: 'relSame',
  different: 'relDifferent',
  mixed: 'relMixed',
};

export function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span className="logo-card logo-card-a" />
      <span className="logo-card logo-card-b" />
      <span className="logo-card logo-card-c" />
    </span>
  );
}

export function SetExample({
  lang,
  showReason = true,
  compact = false,
}: {
  lang: Lang;
  showReason?: boolean;
  compact?: boolean;
}) {
  const reasons = setReason(EXAMPLE_SET);
  return (
    <div className={`set-example ${compact ? 'compact' : ''}`}>
      <div className="set-example-cards">
        {EXAMPLE_SET.map((card) => (
          <CardFace key={card.id} card={card} lang={lang} disabled />
        ))}
      </div>
      {showReason && (
        <ul className="reason-list" aria-label={t(lang, 'reasonTitle')}>
          {reasons.map((reason) => (
            <li key={reason.attr} className={`reason reason-${reason.relation}`}>
              <span className="reason-attr">{t(lang, ATTR_KEYS[reason.attr])}</span>
              <span className="reason-value">{t(lang, REL_KEYS[reason.relation])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
