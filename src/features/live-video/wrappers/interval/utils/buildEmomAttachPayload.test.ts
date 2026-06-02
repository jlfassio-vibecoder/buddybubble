import { describe, expect, it } from 'vitest';

import { createSessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { buildEmomAttachPayload } from '@/features/live-video/wrappers/interval/utils/buildEmomAttachPayload';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import type { TaskRow } from '@/types/database';

function emomTask(): TaskRow {
  return {
    id: 'origin-task-id',
    title: 'EMOM Session',
    metadata: richMetadataWithBlockFormat('emom'),
  } as TaskRow;
}

describe('buildEmomAttachPayload', () => {
  it('returns mechanics_state and block snapshot for emom deck card', () => {
    const snap = createSessionDeckSnapshot(emomTask());
    const payload = buildEmomAttachPayload(snap);
    expect(payload).not.toBeNull();
    expect(payload!.mechanicsState).toMatchObject({
      segment: 'setup',
      minute_index: 0,
      total_minutes: 16,
      interval_seconds: 60,
      setup_seconds: 10,
      segment_started_at: null,
    });
    expect(payload!.blockSnapshot.origin_task_id).toBe('origin-task-id');
    expect(payload!.blockSnapshot.exercises.length).toBeGreaterThan(0);
    expect(payload!.blockSnapshot.exercises.every((ex) => ex.sets === 16)).toBe(true);
  });

  it('returns null for non-emom deck', () => {
    const task = { ...emomTask(), metadata: richMetadataWithBlockFormat('tabata') } as TaskRow;
    expect(buildEmomAttachPayload(createSessionDeckSnapshot(task))).toBeNull();
  });
});
