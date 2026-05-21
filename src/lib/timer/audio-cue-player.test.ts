import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAudioCuePlayer,
  resetWorkoutTimerAudioPlayerForTests,
  type TimerAudioCueKind,
} from './audio-cue-player';

type MockOscillator = {
  type: string;
  frequency: { value: number };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

function createMockContext() {
  const oscillators: MockOscillator[] = [];
  let currentTime = 0;
  let state: AudioContextState = 'running';

  const ctx = {
    get state() {
      return state;
    },
    get currentTime() {
      return currentTime;
    },
    destination: {},
    resume: vi.fn(async () => {
      state = 'running';
    }),
    close: vi.fn(async () => {
      state = 'closed';
    }),
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
    createOscillator: () => {
      const osc: MockOscillator = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    },
  };

  return {
    ctx: ctx as unknown as AudioContext,
    oscillators,
    set currentTime(v: number) {
      currentTime = v;
    },
    setState: (s: AudioContextState) => {
      state = s;
    },
  };
}

describe('audio-cue-player', () => {
  afterEach(() => {
    resetWorkoutTimerAudioPlayerForTests();
  });

  it('prime resumes suspended context', async () => {
    const { ctx, setState } = createMockContext();
    setState('suspended');
    const player = createAudioCuePlayer({ createContext: () => ctx });
    await player.prime();
    expect(ctx.resume).toHaveBeenCalled();
  });

  it('play countdown_tick uses 440 Hz after prime', async () => {
    const { ctx, oscillators } = createMockContext();
    const player = createAudioCuePlayer({ createContext: () => ctx });
    await player.prime();
    player.play('countdown_tick');
    expect(oscillators).toHaveLength(1);
    expect(oscillators[0]!.frequency.value).toBe(440);
  });

  it('play countdown_end uses 880 Hz', async () => {
    const { ctx, oscillators } = createMockContext();
    const player = createAudioCuePlayer({ createContext: () => ctx });
    await player.prime();
    player.play('countdown_end');
    expect(oscillators[0]!.frequency.value).toBe(880);
  });

  it('play amrap_ten_second creates two oscillators', async () => {
    const { ctx, oscillators } = createMockContext();
    const player = createAudioCuePlayer({ createContext: () => ctx });
    await player.prime();
    player.play('amrap_ten_second');
    expect(oscillators).toHaveLength(2);
    expect(oscillators.every((o) => o.frequency.value === 660)).toBe(true);
  });

  it('play no-ops without prime', () => {
    const { ctx, oscillators } = createMockContext();
    const player = createAudioCuePlayer({ createContext: () => ctx });
    player.play('countdown_tick');
    expect(oscillators).toHaveLength(0);
  });

  it('play no-ops when context unavailable', async () => {
    const player = createAudioCuePlayer({ createContext: () => null });
    await player.prime();
    expect(() => player.play('countdown_tick')).not.toThrow();
  });

  it('covers all cue kinds without throw', async () => {
    const { ctx } = createMockContext();
    const player = createAudioCuePlayer({ createContext: () => ctx });
    await player.prime();
    const kinds: TimerAudioCueKind[] = ['countdown_tick', 'countdown_end', 'amrap_ten_second'];
    for (const kind of kinds) {
      expect(() => player.play(kind)).not.toThrow();
    }
  });
});
