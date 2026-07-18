'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  DURATION_PRESETS_MIN,
  type SoloStudioDurationPresetMin,
} from '@/features/live-video/hooks/studio-failsafe-constants';
import { cn } from '@/lib/utils';

export type SoloStudioDurationLobbyProps = {
  onConfirm: (estimatedDurationMin: SoloStudioDurationPresetMin) => void;
  onCancel: () => void;
  className?: string;
  /** Pre-connect create failure message; disables Enter until Retry clears it. */
  errorMessage?: string | null;
  onRetryCreate?: () => void;
};

/**
 * Solo Studio pre-join lobby: host must pick an estimated duration (max 45m)
 * before `joinChannel` so Agora minutes are not burned during setup.
 */
export function SoloStudioDurationLobby({
  onConfirm,
  onCancel,
  className,
  errorMessage = null,
  onRetryCreate,
}: SoloStudioDurationLobbyProps) {
  const [selected, setSelected] = useState<SoloStudioDurationPresetMin | null>(null);
  const canEnter = selected != null && !errorMessage;

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-8',
        className,
      )}
      data-solo-studio-duration-lobby
    >
      <div className="w-full max-w-sm space-y-4">
        <div className="space-y-1 text-center">
          <h2 className="text-lg font-semibold text-foreground">Solo Studio</h2>
          <p className="text-sm text-muted-foreground">
            Choose an estimated session length. Sessions auto-close after this plus a short buffer
            so the camera is not left on by accident.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Estimated session duration</Label>
          <div className="flex flex-wrap justify-center gap-2">
            {DURATION_PRESETS_MIN.map((m) => (
              <Button
                key={m}
                type="button"
                size="sm"
                variant={selected === m ? 'default' : 'outline'}
                onClick={() => setSelected(m)}
                data-testid={`solo-studio-duration-${m}`}
              >
                {m} min
              </Button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">Maximum 45 minutes.</p>
        </div>

        {errorMessage ? (
          <div className="space-y-2 text-center">
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
            {onRetryCreate ? (
              <Button type="button" size="sm" variant="secondary" onClick={onRetryCreate}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canEnter}
            onClick={() => {
              if (selected == null) return;
              onConfirm(selected);
            }}
            data-testid="solo-studio-enter"
          >
            Enter studio
          </Button>
        </div>
      </div>
    </div>
  );
}
