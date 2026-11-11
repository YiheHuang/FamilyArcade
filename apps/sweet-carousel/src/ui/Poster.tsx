import { typeOf } from '../game/data';
import type { Lang } from '../i18n';
import { CarouselTable, type CarouselPod } from './CarouselTable';
import { CardFace, dessertName, type T } from './components';

export function Poster({ t, lang }: { t: T; lang: Lang }) {
  const pods: CarouselPod[] = [
    { seat: 0, name: lang === 'zh' ? '奶奶' : 'Grandma', score: 12, cards: [0, 1, 12, 24], status: 'active' },
    { seat: 1, name: lang === 'zh' ? '阿宝' : 'Bao', score: 9, cards: [12, 13, 36], status: 'picked' },
    { seat: 2, name: lang === 'zh' ? '小满' : 'Mia', score: 14, cards: [24, 25, 48, 60], status: 'waiting' },
    { seat: 3, name: lang === 'zh' ? '爸爸' : 'Dad', score: 7, cards: [36, 48, 49], status: 'waiting' },
  ];
  return (
    <div className="poster" data-testid="poster">
      <div className="poster__grain" aria-hidden />
      <div className="poster__top">
        <span className="poster__kicker">{t('poster.kicker')}</span>
        <span className="poster__monogram" aria-hidden>
          SC
        </span>
      </div>
      <div className="poster__title-wrap">
        <h1>{t('poster.title')}</h1>
        <p>{t('poster.subtitle')}</p>
      </div>
      <div className="poster__art">
        <CarouselTable
          pods={pods}
          passDirection="left"
          round={2}
          pickIndex={3}
          t={t}
          compact
          center={
            <div className="poster__plate">
              {[3, 14, 26].map((cardId, index) => (
                <div key={cardId} className={`poster__card poster__card--${index}`}>
                  <CardFace cardId={cardId} name={dessertName(t, typeOf(cardId))} size="small" />
                </div>
              ))}
            </div>
          }
        />
      </div>
      <div className="poster__footer">
        <span>{t('poster.footer')}</span>
        <span>{t('poster.cta')}</span>
      </div>
    </div>
  );
}
