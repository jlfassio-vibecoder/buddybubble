import { describe, expect, it } from 'vitest';
import {
  boardSupportsScheduledToToday,
  buildPromotionBatches,
} from '@/lib/scheduled-task-promotion';

describe('boardSupportsScheduledToToday', () => {
  it('is true when both slugs exist', () => {
    expect(
      boardSupportsScheduledToToday([{ slug: 'scheduled' }, { slug: 'today' }, { slug: 'done' }]),
    ).toBe(true);
  });

  it('is false when today missing', () => {
    expect(boardSupportsScheduledToToday([{ slug: 'scheduled' }, { slug: 'todo' }])).toBe(false);
  });
});

describe('buildPromotionBatches', () => {
  it('includes workspace only when board has scheduled+today and bubbles exist', () => {
    const ws = [{ id: 'w1', calendar_timezone: 'UTC' }];
    const cols = new Map<string, { slug: string }[]>();
    cols.set('w1', [{ slug: 'scheduled' }, { slug: 'today' }]);
    const bubbles = new Map<string, { id: string }[]>();
    bubbles.set('w1', [{ id: 'b1' }]);

    const batches = buildPromotionBatches(ws, cols, bubbles, new Date('2026-01-15T12:00:00.000Z'));
    expect(batches).toHaveLength(1);
    expect(batches[0].workspaceId).toBe('w1');
    expect(batches[0].bubbleIds).toEqual(['b1']);
    expect(batches[0].localToday).toBe('2026-01-15');
  });

  it('skips workspace without scheduled column', () => {
    const ws = [{ id: 'w1', calendar_timezone: 'UTC' }];
    const cols = new Map<string, { slug: string }[]>();
    cols.set('w1', [{ slug: 'todo' }, { slug: 'done' }]);
    const bubbles = new Map<string, { id: string }[]>();
    bubbles.set('w1', [{ id: 'b1' }]);

    expect(buildPromotionBatches(ws, cols, bubbles)).toHaveLength(0);
  });
});
