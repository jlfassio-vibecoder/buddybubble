'use client';

import { useLayoutEffect, useState } from 'react';
import { NARROW_MAX_QUERY } from '@/lib/viewport';

/** True when viewport is below Tailwind `md` (768px). */
export function useIsNarrowBelowMd(): boolean {
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia(NARROW_MAX_QUERY);
    setNarrow(mq.matches);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}
