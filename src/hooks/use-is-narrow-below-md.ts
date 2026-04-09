'use client';

import { useLayoutEffect, useState } from 'react';

/** True when viewport is below Tailwind `md` (768px). */
export function useIsNarrowBelowMd(): boolean {
  const [narrow, setNarrow] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 767.98px)');
    setNarrow(mq.matches);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return narrow;
}
