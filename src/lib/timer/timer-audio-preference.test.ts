import { afterEach, describe, expect, it } from 'vitest';
import {
  readTimerAudioEnabled,
  TIMER_AUDIO_ENABLED_STORAGE_KEY,
  writeTimerAudioEnabled,
} from './timer-audio-preference';

describe('timer-audio-preference', () => {
  afterEach(() => {
    localStorage.removeItem(TIMER_AUDIO_ENABLED_STORAGE_KEY);
  });

  it('defaults to enabled when key missing', () => {
    expect(readTimerAudioEnabled()).toBe(true);
  });

  it('persists disabled state', () => {
    writeTimerAudioEnabled(false);
    expect(readTimerAudioEnabled()).toBe(false);
  });

  it('persists enabled state', () => {
    writeTimerAudioEnabled(true);
    expect(readTimerAudioEnabled()).toBe(true);
  });
});
