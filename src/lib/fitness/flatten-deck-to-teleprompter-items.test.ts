import { describe, expect, it } from 'vitest';
import { createSessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
import { flattenDeckToTeleprompterItems } from '@/lib/fitness/flatten-deck-to-teleprompter-items';
import type { TaskRow } from '@/types/database';

function taskWithMetadata(metadata: Record<string, unknown>, id = 'origin-1'): TaskRow {
  return {
    id,
    title: 'Workout',
    metadata,
  } as TaskRow;
}

describe('flattenDeckToTeleprompterItems', () => {
  it('flattens multi-exercise cards into items sharing deckItemId', () => {
    const snap = createSessionDeckSnapshot(
      taskWithMetadata({
        exercises: [
          { name: 'Back Squat', sets: 3, reps: 8 },
          { name: 'Push-up', sets: 3, reps: 10 },
        ],
      }),
    );
    const withDeckId = { ...snap, deckItemId: 'deck-row-1' };

    const items = flattenDeckToTeleprompterItems([withDeckId]);
    expect(items).toHaveLength(2);
    expect(items[0]?.id).toBe('deck-row-1-ex-0');
    expect(items[1]?.id).toBe('deck-row-1-ex-1');
    expect(items.every((i) => i.deckItemId === 'deck-row-1')).toBe(true);
    expect(items[0]?.name).toBe('Back Squat');
    expect(items[1]?.name).toBe('Push-up');
    expect(items[0]?.estimateSec).toBeGreaterThan(0);
  });

  it('uses snapshotId when deckItemId is null', () => {
    const snap = createSessionDeckSnapshot(
      taskWithMetadata({
        exercises: [{ name: 'Curl', sets: 2, reps: 12 }],
      }),
    );

    const items = flattenDeckToTeleprompterItems([snap]);
    expect(items).toHaveLength(1);
    expect(items[0]?.deckItemId).toBe(snap.snapshotId);
    expect(items[0]?.id).toBe(`${snap.snapshotId}-ex-0`);
  });

  it('emits one synthetic item for empty card with duration_min', () => {
    const snap = createSessionDeckSnapshot(
      taskWithMetadata({
        workout_type: 'Cardio',
        duration_min: 5,
      }),
    );
    const withDeckId = { ...snap, deckItemId: 'cardio-1' };

    const items = flattenDeckToTeleprompterItems([withDeckId]);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('cardio-1-synthetic');
    expect(items[0]?.deckItemId).toBe('cardio-1');
    expect(items[0]?.estimateSec).toBe(300);
  });

  it('emits one default synthetic item for bare empty card', () => {
    const snap = createSessionDeckSnapshot(taskWithMetadata({}));
    const withDeckId = { ...snap, deckItemId: 'empty-1' };

    const items = flattenDeckToTeleprompterItems([withDeckId]);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('empty-1-synthetic');
    expect(items[0]?.estimateSec).toBe(90);
  });

  it('returns empty array for empty deck', () => {
    expect(flattenDeckToTeleprompterItems([])).toEqual([]);
  });
});
