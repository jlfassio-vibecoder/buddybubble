import { assertEquals } from 'jsr:@std/assert@1';
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

Deno.test('extractWorkoutOpenSessionId reads sessionId from metadata', () => {
  assertEquals(
    extractWorkoutOpenSessionId({
      sessionId: SESSION_ID,
      workout_context: { sessionId: SESSION_ID },
    }),
    SESSION_ID,
  );
});

Deno.test('countPriorWorkoutOpenSentinels excludes trigger row and counts only prior rows', () => {
  const history = [workoutOpenSentinelRow('00000000-0000-4000-8000-000000000890')];

  assertEquals(countPriorWorkoutOpenSentinels([], SESSION_ID, TRIGGER_ID), 0);
  assertEquals(countPriorWorkoutOpenSentinels(history, SESSION_ID, TRIGGER_ID), 1);
  assertEquals(
    countPriorWorkoutOpenSentinels([workoutOpenSentinelRow(TRIGGER_ID)], SESSION_ID, TRIGGER_ID),
    0,
  );
});
