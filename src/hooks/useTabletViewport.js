import { useEffect, useState } from 'react';

// 768px is the practical floor that separates "actual tablet" from
// "phone with a big screen": no current iPhone (including Pro Max, ~430pt
// wide) reports an innerWidth anywhere near it, while every iPad — mini
// through 12.9" — is at or above it in BOTH orientations (mini portrait is
// the narrowest at 744px... actually 768px in points, per Apple's published
// viewport table). Orientation (landscape vs portrait) is deliberately left
// to CSS (`@media (orientation: ...)` in remote-tablet.css) instead of JS
// state here, so rotating the device reflows instantly without a re-render
// or a resize-listener race.
const TABLET_MIN_WIDTH = 768;

export function useIsTabletViewport() {
  const [isTablet, setIsTablet] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= TABLET_MIN_WIDTH
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${TABLET_MIN_WIDTH}px)`);
    const update = () => setIsTablet(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isTablet;
}
