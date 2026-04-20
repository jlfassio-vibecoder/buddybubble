'use client';

import { AnimatePresence, motion } from 'motion/react';
import { cn } from '@/lib/utils';

/** Maps total Bubble Ups (at burst time) to animation strength; caps so UI stays sane above ~25. */
export function burstStrength(total: number): number {
  const t = Math.max(1, Math.min(total, 50));
  return Math.log10(t + 1) / Math.log10(51);
}

export type BubbleBurstProps = {
  activeKey: number;
  /** Emerald when Bubbling up; schema accent when removing / coach typing. */
  tone: 'emerald' | 'schema';
  /** Total Bubble Ups driving particle count, spread, size, and travel (1–50). */
  intensity: number;
  /** When true, skip particles (caller should show a static fallback). */
  prefersReducedMotion?: boolean;
};

/** One-shot upward particle burst (Bubble Up / coach typing loop driver). */
export function BubbleBurst({
  activeKey,
  tone,
  intensity,
  prefersReducedMotion,
}: BubbleBurstProps) {
  const s = burstStrength(intensity);
  const particleCount = Math.min(18, Math.round(5 + s * 13));
  const particles = Array.from({ length: particleCount }, (_, i) => i);
  if (prefersReducedMotion) return null;
  const particleClass =
    tone === 'emerald' ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-[color:var(--sidebar-active)]';
  const spreadBase = 7 + s * 14;
  const liftBase = 26 + s * 22;
  const stagger = Math.max(0.012, 0.032 - s * 0.012);
  const duration = 0.42 + s * 0.35;
  const mid = (particleCount - 1) / 2;

  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      <AnimatePresence>
        {activeKey > 0
          ? particles.map((i) => {
              const spread = (i - mid) * spreadBase;
              const sizePx = 5 + s * 7 + (i % 3) * 0.5;
              return (
                <motion.span
                  key={`${activeKey}-${i}`}
                  className={cn(
                    'absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full',
                    particleClass,
                  )}
                  style={{ width: sizePx, height: sizePx }}
                  initial={{ x: spread * 0.35, y: 0, opacity: 0.95, scale: 0.35 + s * 0.2 }}
                  animate={{
                    x: spread,
                    y: -liftBase - i * (2.2 + s * 2.5),
                    opacity: 0,
                    scale: 0.85 + s * 0.45,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration,
                    ease: [0.22, 1, 0.36, 1],
                    delay: i * stagger,
                  }}
                />
              );
            })
          : null}
      </AnimatePresence>
    </span>
  );
}
