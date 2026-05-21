'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type IntervalShellAudioToggleProps = {
  audioEnabled: boolean;
  onToggle: () => void;
};

export function IntervalShellAudioToggle({
  audioEnabled,
  onToggle,
}: IntervalShellAudioToggleProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={audioEnabled ? 'Mute timer sounds' : 'Unmute timer sounds'}
      aria-pressed={!audioEnabled}
      data-testid="interval-shell-audio-toggle"
    >
      {audioEnabled ? (
        <Volume2 className="h-4 w-4" aria-hidden />
      ) : (
        <VolumeX className="h-4 w-4" aria-hidden />
      )}
    </Button>
  );
}
