import { describe, expect, it } from 'vitest';
import { countPriorWorkoutOpenSentinels, extractWorkoutOpenSessionId } from './sentinel.ts';

const SESSION_ID = '00000000-0000-4000-8000-000000000901';
const TRIGGER_ID = '00000000-0000-4000-8000-000000000897';

function workoutOpenSentinelRow(id: string) {
  return {
    id,
    content: 'Started a workout session.',
    metadata: {
      is_silent_sentinel: true,
      sessionId: SESSION_ID,
      workout_context: {
        source: 'workout_player',
        surface: 'active_session',
        sessionId: SESSION_ID,
      },
    },
  };
}

describe('dispatch sentinel helpers', () => {
  it('extractWorkoutOpenSessionId reads sessionId from metadata', () => {
    expect(
      extractWorkoutOpenSessionId({
        sessionId: SESSION_ID,
        workout_context: { sessionId: SESSION_ID },
      }),
    ).toBe(SESSION_ID);
  });

  it('countPriorWorkoutOpenSentinels excludes trigger row and counts only prior rows', () => {
    const history = [workoutOpenSentinelRow('00000000-0000-4000-8000-000000000890')];

    expect(countPriorWorkoutOpenSentinels([], SESSION_ID, TRIGGER_ID)).toBe(0);
    expect(countPriorWorkoutOpenSentinels(history, SESSION_ID, TRIGGER_ID)).toBe(1);
    expect(
      countPriorWorkoutOpenSentinels([workoutOpenSentinelRow(TRIGGER_ID)], SESSION_ID, TRIGGER_ID),
    ).toBe(0);
  });
});
