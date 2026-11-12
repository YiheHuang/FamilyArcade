import { bossName, bossText, jokerName, jokerText, t, type Lang } from '../i18n';
import { BOSS_BY_ID, JOKER_BY_ID, JOKER_SLOTS, type BossId, type JokerId } from '../game/content';

export function JokerTile({
  id,
  lang,
  inactive = false,
  onClick,
  compact = false,
}: {
  id: JokerId;
  lang: Lang;
  inactive?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  const def = JOKER_BY_ID[id];
  const classes = ['joker-tile', inactive ? 'inactive' : '', compact ? 'compact' : '']
    .filter(Boolean)
    .join(' ');
  const label = `${jokerName(lang, id)} — ${jokerText(lang, id)}`;
  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        title={label}
        aria-label={label}
        onClick={onClick}
        data-testid={`joker-${id}`}
      >
        <span className="joker-glyph" aria-hidden="true">
          {def.glyph}
        </span>
        <span className="joker-name">{jokerName(lang, id)}</span>
        {inactive ? <span className="joker-off">{t(lang, 'inactive')}</span> : null}
      </button>
    );
  }
  return (
    <span className={classes} title={label} data-testid={`joker-${id}`}>
      <span className="joker-glyph" aria-hidden="true">
        {def.glyph}
      </span>
      <span className="joker-name">{jokerName(lang, id)}</span>
      {inactive ? <span className="joker-off">{t(lang, 'inactive')}</span> : null}
    </span>
  );
}

export function JokerShelf({
  jokers,
  lang,
  mirrorwright = false,
  onSell,
  onInfo,
}: {
  jokers: JokerId[];
  lang: Lang;
  mirrorwright?: boolean;
  onSell?: (index: number) => void;
  onInfo?: (id: JokerId) => void;
}) {
  return (
    <div className="joker-shelf" aria-label={t(lang, 'jokers')} data-testid="joker-shelf">
      {Array.from({ length: JOKER_SLOTS }).map((_, index) => {
        const id = jokers[index];
        if (!id) {
          return (
            <span className="joker-slot empty" key={`empty-${index}`}>
              <span aria-hidden="true">+</span>
              <small>{t(lang, 'emptySlot')}</small>
            </span>
          );
        }
        return (
          <div className="joker-slot" key={`${id}-${index}`}>
            <JokerTile
              id={id}
              lang={lang}
              inactive={mirrorwright && index === 0}
              onClick={
                onSell ? () => onSell(index) : onInfo ? () => onInfo(id) : undefined
              }
            />
            {onSell ? <small className="sell-note">{t(lang, 'sell')}</small> : null}
          </div>
        );
      })}
    </div>
  );
}

export function HeartRow({ hearts, lang }: { hearts: number; lang: Lang }) {
  return (
    <span className="heart-row" aria-label={t(lang, 'heartsLeft', { n: hearts })}>
      {Array.from({ length: 3 }).map((_, index) => (
        <span key={index} className={index < hearts ? 'heart full' : 'heart empty'} aria-hidden="true">
          ♥
        </span>
      ))}
    </span>
  );
}

export function BossPlaque({ id, lang }: { id: BossId; lang: Lang }) {
  const def = BOSS_BY_ID[id];
  return (
    <div className="boss-plaque" data-testid="boss-plaque">
      <span className="boss-glyph" aria-hidden="true">
        {def.glyph}
      </span>
      <div>
        <span className="tiny-label">{t(lang, 'boss')}</span>
        <strong>{bossName(lang, id)}</strong>
        <p>{bossText(lang, id)}</p>
      </div>
    </div>
  );
}
