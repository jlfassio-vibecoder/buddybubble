'use client';

import { Button } from '@/components/ui/button';

export function IntervalStartOnlyShell({
  blockId,
  label,
  onStart,
}: {
  blockId: string;
  label: string;
  onStart: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`interval-start-only-${blockId}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-primary">{label}</span>
      <Button type="button" size="sm" onClick={onStart}>
        Start
      </Button>
    </div>
  );
}
