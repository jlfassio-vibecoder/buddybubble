export const TIMER_AUDIO_ENABLED_STORAGE_KEY = 'buddybubble.workout-timer.audio-enabled';

const audioEnabledListeners = new Set<() => void>();

export function subscribeTimerAudioEnabled(onStoreChange: () => void): () => void {
  audioEnabledListeners.add(onStoreChange);
  return () => {
    audioEnabledListeners.delete(onStoreChange);
  };
}

function notifyTimerAudioEnabledChange(): void {
  for (const listener of audioEnabledListeners) {
    listener();
  }
}

export function readTimerAudioEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = localStorage.getItem(TIMER_AUDIO_ENABLED_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

export function writeTimerAudioEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TIMER_AUDIO_ENABLED_STORAGE_KEY, enabled ? '1' : '0');
    notifyTimerAudioEnabledChange();
  } catch {
    // ignore quota / private mode
  }
}
