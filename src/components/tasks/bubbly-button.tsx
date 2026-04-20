'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { BubbleBurst } from '@/components/tasks/bubble-burst';

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
  /**
   * Icon row in `TaskModalTabBar`: larger bubble icon, ~44px touch target, word label screen-reader only.
   * Use with `tabStrip`.
   */
  tabBarIconsRow?: boolean;
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
  tabBarIconsRow = false,
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
  const countLabel = `${count} Bubble Up${count === 1 ? '' : 's'}`;
  const tabBarA11yLabel = hasMine
    ? `Bubbling, ${countLabel}. Remove your Bubble Up.`
    : `Bubbly, ${countLabel}. Add your Bubble Up.`;

  return (
    <motion.div
      className={cn(
        'relative inline-flex rounded-md',
        micro && !tabStrip ? 'max-w-[min(100%,7rem)]' : '',
        tabBarIconsRow && 'flex h-full min-h-11 w-full min-w-0 items-stretch justify-center',
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
      <BubbleBurst
        activeKey={burstKey}
        tone={burstTone}
        intensity={burstIntensity}
        prefersReducedMotion={reduced}
      />
      <button
        type="button"
        className={cn(
          'relative z-10 inline-flex max-w-full items-center gap-0.5 rounded-md font-semibold outline-none ring-offset-background transition-colors',
          'focus-visible:ring-2 focus-visible:ring-offset-2',
          hasMine ? BUBBLE_ACTIVE : BUBBLE_INACTIVE,
          tabBarIconsRow
            ? 'min-h-11 w-full min-w-0 flex-col justify-center gap-0 px-1 py-1 text-[10px]'
            : tabStrip
              ? 'px-1.5 py-0.5 text-[9px]'
              : micro
                ? 'px-1 py-0.5 text-[9px]'
                : 'px-1.5 py-1 text-[10px]',
          (disabled || busy) && 'opacity-40 pointer-events-none',
        )}
        aria-pressed={hasMine}
        {...(tabBarIconsRow ? { 'aria-label': tabBarA11yLabel } : { 'aria-labelledby': labelId })}
        title={
          hasMine ? 'Bubbling — click to remove your Bubble Up' : 'Bubbly — Bubble Up for this card'
        }
        onClick={handleClick}
        onPointerDown={handlePointerDown}
      >
        <BubbleIcon
          className={cn(tabBarIconsRow ? 'size-5' : micro || tabStrip ? 'size-3' : 'size-3.5')}
          filled={hasMine}
          selected={hasMine}
        />
        <span id={labelId} className={cn('min-w-0 truncate', tabBarIconsRow && 'sr-only')}>
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
            tabBarIconsRow && 'leading-none',
          )}
          {...(tabBarIconsRow ? {} : { 'aria-label': `${count} Bubble Ups` })}
        >
          {count > 99 ? '99+' : count}
        </span>
      </button>
    </motion.div>
  );
}
