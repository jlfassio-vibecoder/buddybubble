import { describe, expect, it } from 'vitest';

import { resolveEmomAthleteTaskId } from '@/features/live-video/wrappers/interval/utils/resolveEmomAthleteTaskId';

describe('resolveEmomAthleteTaskId', () => {
  const deckRows = [
    { id: 'row-1', tasks: { id: 'task-1' } } as never,
    { id: 'row-2', tasks: { id: 'task-2' } } as never,
  ];

  it('prefers live session active deck item for host', () => {
    expect(
      resolveEmomAthleteTaskId({
        isHost: true,
        activeDeckItemId: 'row-2',
        hostSnapshotTaskId: 'task-host-abc',
        deckRows,
      }),
    ).toBe('task-2');
  });

  it('falls back to host snapshot task when session row missing', () => {
    expect(
      resolveEmomAthleteTaskId({
        isHost: true,
        activeDeckItemId: 'missing',
        hostSnapshotTaskId: 'task-host-abc',
        deckRows,
      }),
    ).toBe('task-host-abc');
  });

  it('returns empty when host has no session row or snapshot task', () => {
    expect(
      resolveEmomAthleteTaskId({
        isHost: true,
        activeDeckItemId: null,
        hostSnapshotTaskId: null,
        deckRows: [],
      }),
    ).toBe('');
  });

  it('returns participant deck row task when not host', () => {
    expect(
      resolveEmomAthleteTaskId({
        isHost: false,
        activeDeckItemId: 'row-2',
        hostSnapshotTaskId: null,
        deckRows,
      }),
    ).toBe('task-2');
  });

  it('returns empty when participant has no matching deck row', () => {
    expect(
      resolveEmomAthleteTaskId({
        isHost: false,
        activeDeckItemId: 'missing',
        hostSnapshotTaskId: null,
        deckRows,
      }),
    ).toBe('');
  });
});
