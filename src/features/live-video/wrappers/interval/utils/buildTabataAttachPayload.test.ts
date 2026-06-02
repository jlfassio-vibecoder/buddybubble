import { describe, expect, it } from 'vitest';

import { createSessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { buildTabataAttachPayload } from '@/features/live-video/wrappers/interval/utils/buildTabataAttachPayload';
import { richMetadataWithBlockFormat } from '@/lib/workout-factory/__fixtures__/workout-session-view-model.fixtures';
import type { TaskRow } from '@/types/database';

function tabataTask(): TaskRow {
  return {
    id: 'origin-task-id',
    title: 'Tabata Session',
    metadata: richMetadataWithBlockFormat('tabata'),
  } as TaskRow;
}

describe('buildTabataAttachPayload', () => {
  it('returns mechanics_state and block snapshot for tabata deck card', () => {
    const snap = createSessionDeckSnapshot(tabataTask());
    const payload = buildTabataAttachPayload(snap);
    expect(payload).not.toBeNull();
    expect(payload!.mechanicsState).toMatchObject({
      segment: 'setup',
      round_index: 0,
      total_rounds: 8,
      work_seconds: 20,
      rest_seconds: 10,
      setup_seconds: 10,
      segment_started_at: null,
    });
    expect(payload!.blockSnapshot.origin_task_id).toBe('origin-task-id');
    expect(payload!.blockSnapshot.exercises.length).toBeGreaterThan(0);
    expect(payload!.blockSnapshot.exercises.every((ex) => ex.sets === 8)).toBe(true);
  });

  it('returns null for non-tabata deck', () => {
    const task = { ...tabataTask(), metadata: richMetadataWithBlockFormat('amrap') } as TaskRow;
    expect(buildTabataAttachPayload(createSessionDeckSnapshot(task))).toBeNull();
  });
});
