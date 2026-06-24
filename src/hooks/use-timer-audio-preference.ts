'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  readTimerAudioEnabled,
  subscribeTimerAudioEnabled,
  writeTimerAudioEnabled,
} from '@/lib/timer/timer-audio-preference';

export function useTimerAudioPreference(): {
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  toggleAudio: () => void;
} {
  const audioEnabled = useSyncExternalStore(
    subscribeTimerAudioEnabled,
    readTimerAudioEnabled,
    () => true,
  );

  const setAudioEnabled = useCallback((enabled: boolean) => {
    writeTimerAudioEnabled(enabled);
  }, []);

  const toggleAudio = useCallback(() => {
    writeTimerAudioEnabled(!readTimerAudioEnabled());
  }, []);

  return { audioEnabled, setAudioEnabled, toggleAudio };
}
