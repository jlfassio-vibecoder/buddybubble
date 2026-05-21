'use client';

import { useCallback, useState } from 'react';
import { readTimerAudioEnabled, writeTimerAudioEnabled } from '@/lib/timer/timer-audio-preference';

export function useTimerAudioPreference(): {
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  toggleAudio: () => void;
} {
  const [audioEnabled, setAudioEnabledState] = useState(() => readTimerAudioEnabled());

  const setAudioEnabled = useCallback((enabled: boolean) => {
    writeTimerAudioEnabled(enabled);
    setAudioEnabledState(enabled);
  }, []);

  const toggleAudio = useCallback(() => {
    setAudioEnabled(!audioEnabled);
  }, [audioEnabled, setAudioEnabled]);

  return { audioEnabled, setAudioEnabled, toggleAudio };
}
