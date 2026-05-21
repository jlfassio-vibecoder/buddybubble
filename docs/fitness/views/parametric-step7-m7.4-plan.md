# Parametric Step 7 — M7.4 (Polish: Audio Cues & Wake Lock)

**Status:** Shipped (2026-05-21)

**Master plan:** [parametric-step7-plan.md](./parametric-step7-plan.md)

**Prerequisite:** [parametric-step7-m7.3-plan.md](./parametric-step7-m7.3-plan.md) (EMOM shell)

---

## Shipped scope

| Module               | Path                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| Audio player         | [`audio-cue-player.ts`](../../../src/lib/timer/audio-cue-player.ts)                                            |
| Audio preference     | [`timer-audio-preference.ts`](../../../src/lib/timer/timer-audio-preference.ts)                                |
| Countdown audio hook | [`use-interval-countdown-audio.ts`](../../../src/hooks/use-interval-countdown-audio.ts)                        |
| Wake lock hook       | [`use-screen-wake-lock.ts`](../../../src/hooks/use-screen-wake-lock.ts)                                        |
| Shell polish         | [`use-interval-shell-polish.ts`](../../../src/hooks/use-interval-shell-polish.ts)                              |
| Mute toggle          | [`IntervalShellAudioToggle.tsx`](../../../src/components/fitness/interval-shells/IntervalShellAudioToggle.tsx) |
| Shell wiring         | Tabata / AMRAP / EMOM interval shells                                                                          |

## Resolved decisions

| Topic     | Decision                                                                           |
| --------- | ---------------------------------------------------------------------------------- |
| Audio     | AudioContext sine waves — 440 Hz ticks (3/2/1s), 880 Hz boundary, 660 Hz AMRAP 10s |
| Triggers  | `useEffect` on `Math.ceil(remainingMs/1000)` — not inside rAF                      |
| Wake lock | `navigator.wakeLock` while active; release on hidden; re-acquire on visible        |
| Mute      | `localStorage` `buddybubble.workout-timer.audio-enabled`, default on               |
| Reducers  | Untouched                                                                          |

## Verification

```bash
pnpm exec vitest run \
  src/lib/timer/audio-cue-player.test.ts \
  src/lib/timer/timer-audio-preference.test.ts \
  src/hooks/use-interval-countdown-audio.test.tsx \
  src/hooks/use-screen-wake-lock.test.tsx \
  src/lib/workout-factory/interval-timer \
  src/components/fitness/workout-block-renderer/WorkoutPlayerBlockList.test.tsx

pnpm exec tsc --noEmit
```

**Manual QA:** Start timer → 3-2-1-BEEP; mute works; pause releases wake lock; AMRAP 10s warning.

## Step 7 complete

All core timer formats (Tabata, AMRAP, EMOM) plus floor polish are shipped locally on `WorkoutPlayer`.
