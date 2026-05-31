'use client';

import { List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type Tier3ExercisesReopenPillProps = {
  className?: string;
  onClick: () => void;
};

export function Tier3ExercisesReopenPill({ className, onClick }: Tier3ExercisesReopenPillProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={cn(
        'absolute left-4 top-1/2 z-50 -translate-y-1/2 gap-1.5 rounded-full shadow-md',
        className,
      )}
      onClick={onClick}
    >
      <List className="size-4 shrink-0" aria-hidden />
      Exercises
    </Button>
  );
}
