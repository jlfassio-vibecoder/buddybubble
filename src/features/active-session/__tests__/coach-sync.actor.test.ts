import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoOpCoachSyncAdapter, type CoachSyncAdapter } from '../actors/coach-sync.actor';
import { createStartedTestActor, flushPromises } from './test-utils/mock-persistence';

describe('coachSync actor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits COACH_PATCH once per message fingerprint', async () => {
    const adapter: CoachSyncAdapter = {
      ...createNoOpCoachSyncAdapter(),
    };
    const actor = createStartedTestActor({ coachSyncAdapter: adapter });

    const snapshot = {
      isLoading: false,
      coachAuthUserId: 'coach-user',
      messages: [
        {
          id: 'msg-1',
          user_id: 'coach-user',
          metadata: {
            execution_patch: [{ exerciseIndex: 0, setIndex: 0, weight: '135' }],
          },
        },
      ],
    };

    actor.send({ type: 'COACH_THREAD_SNAPSHOT', snapshot: snapshot as never });
    actor.send({ type: 'COACH_THREAD_SNAPSHOT', snapshot: snapshot as never });
    await Promise.resolve();

    expect(actor.getSnapshot().context.draftLogs[0][0].weight).toBe('135');
  });

  it('skips silent workout sentinels when scanning patches', async () => {
    const actor = createStartedTestActor();
    const before = actor.getSnapshot().context.draftLogs[0][0].weight;

    actor.send({
      type: 'COACH_THREAD_SNAPSHOT',
      snapshot: {
        isLoading: false,
        coachAuthUserId: 'coach-user',
        messages: [
          {
            id: 'sentinel-1',
            user_id: 'coach-user',
            content: 'Started a workout session.',
            metadata: {
              is_silent_sentinel: true,
              workout_context: { source: 'workout_player' },
            },
          },
        ],
      } as never,
    });
    await Promise.resolve();

    expect(actor.getSnapshot().context.draftLogs[0][0].weight).toBe(before);
  });

  it('fires sentinel and reports success', async () => {
    let fired = false;
    const adapter: CoachSyncAdapter = {
      fireSentinel: async () => {
        fired = true;
      },
      canAttemptSentinel: () => true,
    };
    const actor = createStartedTestActor({ coachSyncAdapter: adapter });

    actor.send({ type: 'COACH_TRY_SENTINEL' });
    await Promise.resolve();
    await Promise.resolve();

    expect(fired).toBe(true);
    expect(actor.getSnapshot().context.sentinelFired).toBe(true);
    expect(actor.getSnapshot().context.sentinelFailed).toBe(false);
  });

  it('reports sentinel failure and allows retry', async () => {
    let attempts = 0;
    const adapter: CoachSyncAdapter = {
      fireSentinel: async () => {
        attempts += 1;
        throw new Error('send_failed');
      },
      canAttemptSentinel: () => true,
    };
    const actor = createStartedTestActor({ coachSyncAdapter: adapter });

    actor.send({ type: 'COACH_TRY_SENTINEL' });
    await flushPromises();
    await flushPromises();

    expect(attempts).toBe(1);
    expect(actor.getSnapshot().context.sentinelFailed).toBe(true);
    expect(actor.getSnapshot().context.sentinelFired).toBe(false);

    actor.send({ type: 'COACH_TRY_SENTINEL' });
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(attempts).toBe(2);
  });
});
