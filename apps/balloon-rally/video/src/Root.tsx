import { Composition, Still } from 'remotion';
import { Poster } from './Poster';
import { Promo } from './Promo';
import { DURATION, FPS, HEIGHT, WIDTH } from './theme';

const PromoEN = () => <Promo lang="en" />;
const PromoZH = () => <Promo lang="zh" />;
const PosterEN = () => <Poster lang="en" />;
const PosterZH = () => <Poster lang="zh" />;

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="BalloonRallyPromoEN"
        component={PromoEN}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="BalloonRallyPromoZH"
        component={PromoZH}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Still id="BalloonRallyPosterEN" component={PosterEN} width={WIDTH} height={HEIGHT} />
      <Still id="BalloonRallyPosterZH" component={PosterZH} width={WIDTH} height={HEIGHT} />
    </>
  );
}
