'use client';

import { useLayoutEffect, useState } from 'react';
import { NARROW_MAX_QUERY, readIsNarrowBelowMd } from '@/lib/viewport';

/** True when viewport is below Tailwind `md` (768px). */
export function useIsNarrowBelowMd(): boolean {
  // SSR and the first client paint must agree (desktop=false). Viewport is applied in useLayoutEffect.
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    setNarrow(readIsNarrowBelowMd());
    const mq = window.matchMedia(NARROW_MAX_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}
