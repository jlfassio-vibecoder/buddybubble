'use client';

import { Sparkles } from 'lucide-react';
import { PremiumGate } from '@/components/subscription/premium-gate';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Primary “Generate” styling shared by TaskModal hero, Details, and chat cards. */
export const WORKOUT_AI_GENERATE_PRIMARY_CLASS = cn(
  'gap-2 px-3 text-xs font-semibold',
  'shadow-[0_0_22px_color-mix(in_oklab,var(--primary)_45%,transparent)]',
  'hover:shadow-[0_0_32px_color-mix(in_oklab,var(--primary)_60%,transparent)]',
  'hover:bg-primary/92 active:bg-primary/88',
  'transition-[box-shadow,background-color] duration-200',
);

const sparklesClassName =
  'size-4 shrink-0 transition-transform duration-200 group-hover/button:scale-110 group-hover/button:drop-shadow-[0_0_10px_color-mix(in_oklab,var(--primary-foreground)_55%,transparent)]';

export type WorkoutAiGenerateButtonProps = {
  onClick: () => void;
  busy?: boolean;
  title?: string;
  className?: string;
};

export function WorkoutAiGenerateButton({
  onClick,
  busy = false,
  title = "Build the plan from this card's title, description, and duration (same as Details → AI workout).",
  className,
}: WorkoutAiGenerateButtonProps) {
  return (
    <PremiumGate feature="ai" inline>
      <Button
        type="button"
        variant="default"
        size="sm"
        className={cn(WORKOUT_AI_GENERATE_PRIMARY_CLASS, className)}
        disabled={busy}
        onClick={onClick}
        title={title}
      >
        <Sparkles className={sparklesClassName} aria-hidden />
        {busy ? 'Generating…' : 'Generate'}
      </Button>
    </PremiumGate>
  );
}
