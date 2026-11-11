import { Composition } from 'remotion';
import gamesData from './data/games.json';
import { Promo } from './Promo';
import { FPS, HEIGHT, SECONDS, WIDTH, type VideoGame } from './theme';

const GAMES = gamesData as VideoGame[];

export function RemotionRoot() {
  return (
    <>
      {GAMES.flatMap((game) =>
        (['en', 'zh'] as const).map((lang) => (
          <Composition
            key={`${game.slug}-${lang}`}
            id={`Promo-${game.slug}-${lang}`}
            component={Promo}
            durationInFrames={SECONDS * FPS}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
            defaultProps={{ slug: game.slug, lang }}
          />
        )),
      )}
    </>
  );
}
