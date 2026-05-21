export type TimerAudioCueKind = 'countdown_tick' | 'countdown_end' | 'amrap_ten_second';

export type AudioCuePlayer = {
  prime: () => Promise<void>;
  play: (kind: TimerAudioCueKind) => void;
  dispose: () => void;
};

export type CreateAudioCuePlayerOptions = {
  createContext?: () => AudioContext | null;
};

const CUE_CONFIG: Record<
  TimerAudioCueKind,
  { frequency: number; durationSec: number; count?: number; gapSec?: number }
> = {
  countdown_tick: { frequency: 440, durationSec: 0.08 },
  countdown_end: { frequency: 880, durationSec: 0.15 },
  amrap_ten_second: { frequency: 660, durationSec: 0.08, count: 2, gapSec: 0.1 },
};

function defaultCreateContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  return new Ctx();
}

export function createAudioCuePlayer(options?: CreateAudioCuePlayerOptions): AudioCuePlayer {
  const createContext = options?.createContext ?? defaultCreateContext;
  let context: AudioContext | null = null;
  let primed = false;

  const ensureContext = (): AudioContext | null => {
    if (!context) context = createContext();
    return context;
  };

  const playTone = (ctx: AudioContext, frequency: number, durationSec: number, startAt: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + durationSec + 0.02);
  };

  return {
    prime: async () => {
      const ctx = ensureContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      primed = true;
    },

    play: (kind) => {
      if (!primed) return;
      const ctx = ensureContext();
      if (!ctx) return;

      const cfg = CUE_CONFIG[kind];
      const count = cfg.count ?? 1;
      const gapSec = cfg.gapSec ?? 0;
      let t = ctx.currentTime;

      for (let i = 0; i < count; i++) {
        playTone(ctx, cfg.frequency, cfg.durationSec, t);
        t += cfg.durationSec + gapSec;
      }
    },

    dispose: () => {
      if (context && context.state !== 'closed') {
        void context.close();
      }
      context = null;
      primed = false;
    },
  };
}

let singleton: AudioCuePlayer | null = null;

export function getWorkoutTimerAudioPlayer(): AudioCuePlayer {
  if (!singleton) singleton = createAudioCuePlayer();
  return singleton;
}

export function resetWorkoutTimerAudioPlayerForTests(): void {
  singleton?.dispose();
  singleton = null;
}
