'use client';

import type { WorkoutSessionBlockView } from '@/lib/workout-factory/workout-session-view-model';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type WorkoutInstructionBlockEditProps = {
  block: WorkoutSessionBlockView;
  canWrite: boolean;
  idPrefix: string;
  onChange: (patch: { name?: string; instructions?: string[] }) => void;
};

export function WorkoutInstructionBlockEdit({
  block,
  canWrite,
  idPrefix,
  onChange,
}: WorkoutInstructionBlockEditProps) {
  const instructionText = block.instructions.join('\n');

  return (
    <div className="flex gap-4 rounded-xl bg-muted/30 p-3 ring-1 ring-border/10">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-background/60 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Prep
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-inst-name`} className="text-xs">
            Section label
          </Label>
          <Input
            id={`${idPrefix}-inst-name`}
            value={block.name}
            disabled={!canWrite}
            onChange={(e) => onChange({ name: e.target.value })}
            className="h-8 font-semibold"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-inst-lines`} className="text-xs">
            Instructions (one line per bullet)
          </Label>
          <Textarea
            id={`${idPrefix}-inst-lines`}
            disabled={!canWrite}
            value={instructionText}
            rows={Math.max(2, block.instructions.length)}
            onChange={(e) => {
              const lines = e.target.value
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean);
              const padded =
                block.instructions.length > 0
                  ? Array.from({ length: block.instructions.length }, (_, i) => lines[i] ?? '')
                  : lines;
              onChange({ instructions: padded.filter((l) => l.length > 0) });
            }}
            className="min-h-[64px] resize-y text-xs"
          />
        </div>
      </div>
    </div>
  );
}
