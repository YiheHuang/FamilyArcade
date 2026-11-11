import { pitNumber, type LastMove, type Player, type Status } from '../game/sowing';
import { t, type Lang } from '../i18n';

const MAX_DOTS = 18;

function Seeds({ count }: { count: number }) {
  const dots = Math.min(count, MAX_DOTS);
  return (
    <span className="seeds" aria-hidden="true">
      {Array.from({ length: dots }, (_, index) => (
        <span key={index} className="seed" />
      ))}
    </span>
  );
}

export function Board({
  pits,
  stores,
  perspective,
  turn,
  status,
  playablePits,
  last,
  hint,
  labels,
  shortLabels,
  compact,
  lang,
  onPit,
}: {
  pits: number[];
  stores: [number, number];
  perspective: Player;
  turn: Player;
  status: Status;
  playablePits: number[];
  last: LastMove | null;
  hint: number | null;
  labels: [string, string];
  shortLabels?: [string, string];
  compact?: boolean;
  lang: Lang;
  onPit: (pit: number) => void;
}) {
  const topRow = perspective === 0 ? [12, 11, 10, 9, 8, 7] : [5, 4, 3, 2, 1, 0];
  const bottomRow = perspective === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12];
  const topStore: Player = perspective === 0 ? 1 : 0;
  const bottomStore: Player = perspective === 0 ? 0 : 1;

  const pitButton = (pit: number) => {
    const owner: Player = pit <= 5 ? 0 : 1;
    const count = pits[pit] ?? 0;
    const local = pitNumber(owner, pit);
    const playable = status === 'playing' && playablePits.includes(pit);
    const classes = [
      'pit',
      owner === 0 ? 'south' : 'north',
      playable ? 'playable' : '',
      last?.pit === pit ? 'last' : '',
      last?.path.includes(pit) ? 'touched' : '',
      hint === pit ? 'hint' : '',
      count === 0 ? 'empty' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <button
        key={pit}
        type="button"
        className={classes}
        data-pit={pit}
        data-local={local}
        aria-label={t(lang, 'pitAria', { player: labels[owner], pit: local, count })}
        disabled={!playable}
        onClick={() => onPit(pit)}
      >
        <span className="pit-number" aria-hidden="true">{local}</span>
        <Seeds count={count} />
        <span className="pit-count" aria-hidden="true">{count}</span>
        {last?.pit === pit && <span className="pit-mark" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <div
      className={`mancala${compact ? ' compact' : ''}`}
      data-perspective={perspective}
      data-turn={turn}
      role="group"
      aria-label={t(lang, 'boardAria')}
    >
      <div
        className={`store top store-${topStore}`}
        data-store={topStore}
        aria-label={t(lang, 'storeAria', { player: labels[topStore], count: stores[topStore] })}
      >
        <span className="store-label" title={labels[topStore]}>
          <span className="store-label-long">{labels[topStore]}</span>
          <span className="store-label-short">{shortLabels?.[topStore] ?? labels[topStore]}</span>
        </span>
        <strong className="store-number">{stores[topStore]}</strong>
        <span className="store-word">{t(lang, 'store')}</span>
      </div>
      <div className="row top-row">{topRow.map(pitButton)}</div>
      <div className="row bottom-row">{bottomRow.map(pitButton)}</div>
      <div
        className={`store bottom store-${bottomStore}`}
        data-store={bottomStore}
        aria-label={t(lang, 'storeAria', { player: labels[bottomStore], count: stores[bottomStore] })}
      >
        <span className="store-label" title={labels[bottomStore]}>
          <span className="store-label-long">{labels[bottomStore]}</span>
          <span className="store-label-short">{shortLabels?.[bottomStore] ?? labels[bottomStore]}</span>
        </span>
        <strong className="store-number">{stores[bottomStore]}</strong>
        <span className="store-word">{t(lang, 'store')}</span>
      </div>
    </div>
  );
}
