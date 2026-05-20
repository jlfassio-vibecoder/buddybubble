'use client';

import { Dumbbell } from 'lucide-react';

type WorkoutExerciseThumbnailProps = {
  src: string | null;
  alt: string;
  compact?: boolean;
};

export function WorkoutExerciseThumbnail({ src, alt, compact }: WorkoutExerciseThumbnailProps) {
  const size = compact ? 'h-12 w-12' : 'h-16 w-16';
  return (
    <div
      className={`relative ${size} shrink-0 overflow-hidden rounded-lg border border-border/50 bg-background/80 shadow-sm ring-1 ring-border/20`}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/30" aria-hidden>
          <Dumbbell
            className={
              compact ? 'size-5 text-muted-foreground/45' : 'size-6 text-muted-foreground/45'
            }
          />
        </div>
      )}
    </div>
  );
}
