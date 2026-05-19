'use client';

import { useEffect, useRef } from 'react';

const SWIPE_DX_MIN = 32;
const SWIPE_DY_MAX = 24;
const SWIPE_MS_MAX = 400;

type Props = {
  onOpen: () => void;
  disabled?: boolean;
};

/**
 * Fixed left-edge strip: swipe right to open the mobile menu drawer.
 * Menu tab remains the accessible entry point; this is a supplementary gesture.
 */
export function MobileEdgeSwipeOpener({ onOpen, disabled = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    let startX = 0;
    let startY = 0;
    let startT = 0;
    let tracking = false;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!e.isPrimary) return;
      tracking = true;
      startX = e.clientX;
      startY = e.clientY;
      startT = performance.now();
    };

    const onMove = (e: PointerEvent) => {
      if (!tracking) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dy) > SWIPE_DY_MAX || performance.now() - startT > SWIPE_MS_MAX) {
        tracking = false;
        return;
      }
      if (dx > SWIPE_DX_MIN) {
        tracking = false;
        onOpen();
      }
    };

    const onUp = () => {
      tracking = false;
    };

    el.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });

    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [onOpen, disabled]);

  if (disabled) return null;

  return (
    <div
      ref={ref}
      aria-hidden
      className="fixed left-0 z-[80] w-[18px] touch-pan-y md:hidden"
      style={{
        top: 'var(--mobile-header-h, 0px)',
        bottom: 'var(--mobile-tab-bar-h, 0px)',
      }}
    />
  );
}
