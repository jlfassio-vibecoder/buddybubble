'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

/**
 * Inactive — workspace bubble rail accent (`--sidebar-active` from theme engine).
 * Mirrors selected-bubble styling in bubble-sidebar / WorkspaceRail.
 */
const BUBBLE_INACTIVE =
  'text-[color:var(--sidebar-active)] bg-[color:color-mix(in_srgb,var(--sidebar-active)_12%,transparent)] hover:bg-[color:color-mix(in_srgb,var(--sidebar-active)_20%,transparent)] focus-visible:ring-[color:var(--sidebar-active)]';

/** Active — user is Bubbling; green + “Bubbling”. */
const BUBBLE_ACTIVE =
  'text-emerald-600 bg-emerald-500/12 hover:bg-emerald-500/18 focus-visible:ring-emerald-500/50 dark:text-emerald-300 dark:bg-emerald-500/15 dark:hover:bg-emerald-500/22';

export type TaskBubbleUpControlProps = {
  count: number;
  hasMine: boolean;
  disabled?: boolean;
  busy?: boolean;
  onToggle: () => void;
  /** Tighter padding / text for Kanban micro cards */
  density?: 'default' | 'micro';
  /** Match card section tab chips (next to Details / … / Activity). */
  tabStrip?: boolean;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const fn = () => setReduced(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduced;
}

function BubbleIcon({
  className,
  filled,
  selected,
}: {
  className?: string;
  filled: boolean;
  /** True when user is Bubbling (green); false uses bubble schema accent. */
  selected: boolean;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={cn(
        'shrink-0',
        selected ? 'text-emerald-600 dark:text-emerald-400' : 'text-[color:var(--sidebar-active)]',
        className,
      )}
      aria-hidden
    >
      <circle
        cx="8"
        cy="10"
        r="5"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.5}
      />
      <circle
        cx="13"
        cy="8"
        r="4"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.5}
        opacity={filled ? 0.92 : 1}
      />
    </svg>
  );
}

/** Maps total Bubble Ups (at burst time) to animation strength; caps so UI stays sane above ~25. */
function burstStrength(total: number): number {
  const t = Math.max(1, Math.min(total, 50));
  return Math.log10(t + 1) / Math.log10(51);
}

function BubbleBurst({
  activeKey,
  tone,
  intensity,
}: {
  activeKey: number;
  /** Emerald when Bubbling up; schema accent when removing. */
  tone: 'emerald' | 'schema';
  /** Total Bubble Ups driving particle count, spread, size, and travel (1–50). */
  intensity: number;
}) {
  const reduced = usePrefersReducedMotion();
  const s = burstStrength(intensity);
  const particleCount = Math.min(18, Math.round(5 + s * 13));
  const particles = Array.from({ length: particleCount }, (_, i) => i);
  if (reduced) return null;
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

/**
 * Inactive: bubble schema accent + “Bubbly” + total count.
 * Active (hasMine): green + “Bubbling” + total count.
 */
export function BubblyButton({
  count,
  hasMine,
  disabled,
  busy,
  onToggle,
  density = 'default',
  tabStrip = false,
}: TaskBubbleUpControlProps) {
  const labelId = useId();
  const [burstKey, setBurstKey] = useState(0);
  const [burstIntensity, setBurstIntensity] = useState(1);
  const [burstTone, setBurstTone] = useState<'emerald' | 'schema'>('emerald');
  const reduced = usePrefersReducedMotion();

  /** 0 = no idle trend pulse; ramps from 2+ Bubble Ups. */
  const trendTier = count >= 2 ? Math.min((count - 1) / 28, 1) : 0;
  const showTrendAmbience = trendTier > 0 && !reduced;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (disabled || busy) return;
      if (!reduced) {
        const nextTotal = hasMine ? Math.max(1, count - 1) : count + 1;
        setBurstIntensity(Math.min(50, Math.max(1, nextTotal)));
        setBurstTone(hasMine ? 'schema' : 'emerald');
        setBurstKey((k) => k + 1);
      }
      onToggle();
    },
    [busy, count, disabled, hasMine, onToggle, reduced],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
  }, []);

  const micro = density === 'micro';
  const label = hasMine ? 'Bubbling' : 'Bubbly';

  return (
    <motion.div
      className={cn(
        'relative inline-flex rounded-md',
        micro && !tabStrip ? 'max-w-[min(100%,7rem)]' : '',
      )}
      animate={
        showTrendAmbience
          ? {
              scale: [1, 1 + 0.01 + trendTier * 0.042, 1],
            }
          : false
      }
      transition={
        showTrendAmbience
          ? {
              duration: Math.max(0.95, 2.15 - trendTier * 0.95),
              repeat: Infinity,
              ease: 'easeInOut',
            }
          : undefined
      }
    >
      <BubbleBurst activeKey={burstKey} tone={burstTone} intensity={burstIntensity} />
      <button
        type="button"
        className={cn(
          'relative z-10 inline-flex max-w-full items-center gap-0.5 rounded-md font-semibold outline-none ring-offset-background transition-colors',
          'focus-visible:ring-2 focus-visible:ring-offset-2',
          hasMine ? BUBBLE_ACTIVE : BUBBLE_INACTIVE,
          tabStrip
            ? 'px-1.5 py-0.5 text-[9px]'
            : micro
              ? 'px-1 py-0.5 text-[9px]'
              : 'px-1.5 py-1 text-[10px]',
          (disabled || busy) && 'opacity-40 pointer-events-none',
        )}
        aria-pressed={hasMine}
        aria-labelledby={labelId}
        title={
          hasMine ? 'Bubbling — click to remove your Bubble Up' : 'Bubbly — Bubble Up for this card'
        }
        onClick={handleClick}
        onPointerDown={handlePointerDown}
      >
        <BubbleIcon
          className={micro || tabStrip ? 'size-3' : 'size-3.5'}
          filled={hasMine}
          selected={hasMine}
        />
        <span id={labelId} className="min-w-0 truncate">
          {label}
        </span>
        <span
          className={cn(
            'tabular-nums font-semibold',
            count === 0
              ? 'text-muted-foreground'
              : hasMine
                ? 'text-emerald-800 dark:text-emerald-200'
                : 'text-[color:color-mix(in_srgb,var(--sidebar-active)_75%,var(--foreground))]',
            micro ? 'text-[9px]' : 'text-[10px]',
          )}
          aria-label={`${count} Bubble Ups`}
        >
          {count > 99 ? '99+' : count}
        </span>
      </button>
    </motion.div>
  );
}
