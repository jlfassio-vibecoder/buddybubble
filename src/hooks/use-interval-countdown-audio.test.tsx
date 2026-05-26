import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { resetWorkoutTimerAudioPlayerForTests } from '@/lib/timer/audio-cue-player';
import {
  evaluateIntervalCountdownCues,
  useIntervalCountdownAudio,
} from './use-interval-countdown-audio';

const play = vi.fn();
const prime = vi.fn(async () => {});

vi.mock('@/lib/timer/audio-cue-player', () => ({
  getWorkoutTimerAudioPlayer: () => ({ play, prime, dispose: vi.fn() }),
  resetWorkoutTimerAudioPlayerForTests: vi.fn(),
}));

describe('useIntervalCountdownAudio', () => {
  afterEach(() => {
    play.mockClear();
    resetWorkoutTimerAudioPlayerForTests();
  });

  const base = {
    cueSegmentKey: 'work-0',
    audioEnabled: true,
    isActive: true,
  };

  it('plays countdown ticks at 3, 2, 1 seconds', () => {
    const { rerender } = renderHook(
      ({ remainingMs }) => useIntervalCountdownAudio({ ...base, remainingMs }),
      { initialProps: { remainingMs: 3000 } },
    );
    expect(play).toHaveBeenCalledWith('countdown_tick');

    play.mockClear();
    rerender({ remainingMs: 2000 });
    expect(play).toHaveBeenCalledWith('countdown_tick');

    play.mockClear();
    rerender({ remainingMs: 1000 });
    expect(play).toHaveBeenCalledWith('countdown_tick');
  });

  it('plays countdown_end at 0 seconds once per segment', () => {
    const { rerender } = renderHook(
      ({ remainingMs }) => useIntervalCountdownAudio({ ...base, remainingMs }),
      { initialProps: { remainingMs: 500 } },
    );
    play.mockClear();
    rerender({ remainingMs: 0 });
    expect(play).toHaveBeenCalledWith('countdown_end');
    play.mockClear();
    rerender({ remainingMs: 0 });
    expect(play).not.toHaveBeenCalled();
  });

  it('re-arms ticks when cueSegmentKey changes', () => {
    const { rerender } = renderHook(
      ({ cueSegmentKey, remainingMs }) =>
        useIntervalCountdownAudio({ ...base, cueSegmentKey, remainingMs }),
      { initialProps: { cueSegmentKey: 'work-0', remainingMs: 3000 } },
    );
    expect(play).toHaveBeenCalledWith('countdown_tick');
    play.mockClear();
    rerender({ cueSegmentKey: 'rest-0', remainingMs: 3000 });
    expect(play).toHaveBeenCalledWith('countdown_tick');
  });

  it('does not play when audio disabled', () => {
    renderHook(() =>
      useIntervalCountdownAudio({
        ...base,
        remainingMs: 3000,
        audioEnabled: false,
      }),
    );
    expect(play).not.toHaveBeenCalled();
  });

  it('re-arms amrap cues after isActive restarts with the same global segment key', () => {
    const amrapBase = {
      ...base,
      cueSegmentKey: 'global',
      amrapTenSecondWarning: true,
    };

    const { rerender } = renderHook(
      ({ remainingMs, isActive }) =>
        useIntervalCountdownAudio({ ...amrapBase, remainingMs, isActive }),
      { initialProps: { remainingMs: 10_000, isActive: true } },
    );
    expect(play).toHaveBeenCalledWith('amrap_ten_second');

    play.mockClear();
    rerender({ remainingMs: 0, isActive: true });
    expect(play).toHaveBeenCalledWith('countdown_end');

    play.mockClear();
    rerender({ remainingMs: 12 * 60_000, isActive: false });

    play.mockClear();
    rerender({ remainingMs: 10_000, isActive: true });
    expect(play).toHaveBeenCalledWith('amrap_ten_second');
  });

  it('plays amrap ten second warning once', () => {
    const { rerender } = renderHook(
      ({ remainingMs }) =>
        useIntervalCountdownAudio({
          ...base,
          remainingMs,
          cueSegmentKey: 'global',
          amrapTenSecondWarning: true,
        }),
      { initialProps: { remainingMs: 11_000 } },
    );
    play.mockClear();
    rerender({ remainingMs: 10_000 });
    expect(play).toHaveBeenCalledWith('amrap_ten_second');
    play.mockClear();
    rerender({ remainingMs: 9_500 });
    expect(play).not.toHaveBeenCalled();
  });
});

describe('evaluateIntervalCountdownCues', () => {
  afterEach(() => {
    play.mockClear();
  });

  function makeRefs() {
    return {
      lastSegmentRef: { current: null as string | null },
      lastTickSecRef: { current: null as number | null },
      lastEndSegmentRef: { current: null as string | null },
      tenSecWarnedRef: { current: false },
    };
  }

  it('plays countdown ticks at 3, 2, 1 seconds', () => {
    const refs = makeRefs();
    const player = { play, prime, dispose: vi.fn() };

    evaluateIntervalCountdownCues(player, 3, 'work-0', false, refs);
    expect(play).toHaveBeenCalledWith('countdown_tick');

    play.mockClear();
    evaluateIntervalCountdownCues(player, 2, 'work-0', false, refs);
    expect(play).toHaveBeenCalledWith('countdown_tick');

    play.mockClear();
    evaluateIntervalCountdownCues(player, 1, 'work-0', false, refs);
    expect(play).toHaveBeenCalledWith('countdown_tick');
  });

  it('re-arms ticks when cueSegmentKey changes', () => {
    const refs = makeRefs();
    const player = { play, prime, dispose: vi.fn() };

    evaluateIntervalCountdownCues(player, 3, 'work-0', false, refs);
    play.mockClear();
    evaluateIntervalCountdownCues(player, 3, 'rest-0', false, refs);
    expect(play).toHaveBeenCalledWith('countdown_tick');
  });
});

describe('useIntervalCountdownAudio live path', () => {
  let rafCallback: FrameRequestCallback | null = null;

  beforeEach(() => {
    rafCallback = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    play.mockClear();
    resetWorkoutTimerAudioPlayerForTests();
    vi.unstubAllGlobals();
  });

  const base = {
    cueSegmentKey: 'work-0',
    audioEnabled: true,
    isActive: true,
  };

  function runRafFrame() {
    expect(rafCallback).not.toBeNull();
    rafCallback!(0);
  }

  it('plays countdown ticks via getRemainingMs rAF loop', () => {
    let remainingMs = 3000;
    renderHook(() =>
      useIntervalCountdownAudio({
        ...base,
        getRemainingMs: () => remainingMs,
      }),
    );

    runRafFrame();
    expect(play).toHaveBeenCalledWith('countdown_tick');

    play.mockClear();
    remainingMs = 2000;
    runRafFrame();
    expect(play).toHaveBeenCalledWith('countdown_tick');

    play.mockClear();
    remainingMs = 1000;
    runRafFrame();
    expect(play).toHaveBeenCalledWith('countdown_tick');

    play.mockClear();
    remainingMs = 0;
    runRafFrame();
    expect(play).toHaveBeenCalledWith('countdown_end');
  });

  it('skips audio when document is hidden', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });

    renderHook(() =>
      useIntervalCountdownAudio({
        ...base,
        getRemainingMs: () => 3000,
      }),
    );

    runRafFrame();
    expect(play).not.toHaveBeenCalled();
  });
});
