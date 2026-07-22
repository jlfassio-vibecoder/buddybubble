import { describe, expect, it } from 'vitest';
import type { TaskRow } from '@/types/database';
import {
  concatPinnedUnpinned,
  nextPinOrder,
  orderColumnTasksWithPins,
  reindexPinOrders,
  sortPinnedByPinOrder,
  taskIsPinned,
} from './task-pin';

function taskStub(partial: Partial<TaskRow> & { id: string }): TaskRow {
  return {
    bubble_id: 'b1',
    title: 't',
    description: null,
    status: 'planned',
    position: 0,
    priority: 'medium',
    assigned_to: null,
    created_at: '2026-01-01T00:00:00Z',
    scheduled_on: null,
    scheduled_time: null,
    archived_at: null,
    program_id: null,
    program_session_key: null,
    attachments: [],
    item_type: 'task',
    metadata: {},
    visibility: 'private',
    is_pinned: false,
    pin_order: null,
    ...partial,
  } as TaskRow;
}

describe('taskIsPinned', () => {
  it('reads is_pinned', () => {
    expect(taskIsPinned(taskStub({ id: 'a', is_pinned: true }))).toBe(true);
    expect(taskIsPinned(taskStub({ id: 'b', is_pinned: false }))).toBe(false);
  });
});

describe('sortPinnedByPinOrder', () => {
  it('orders by pin_order ascending', () => {
    const a = taskStub({ id: 'a', is_pinned: true, pin_order: 2 });
    const b = taskStub({ id: 'b', is_pinned: true, pin_order: 1 });
    expect(sortPinnedByPinOrder([a, b]).map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('orderColumnTasksWithPins', () => {
  it('puts pinned first then date-desc unpinned', () => {
    const pinned = taskStub({
      id: 'pin',
      is_pinned: true,
      pin_order: 1,
      scheduled_on: '2020-01-01',
    });
    const older = taskStub({
      id: 'older',
      scheduled_on: '2026-01-01',
      created_at: '2026-01-01T00:00:00Z',
    });
    const newer = taskStub({
      id: 'newer',
      scheduled_on: '2026-06-01',
      created_at: '2026-06-01T00:00:00Z',
    });
    const { pinned: p, unpinned } = orderColumnTasksWithPins([older, pinned, newer], 'desc');
    expect(p.map((t) => t.id)).toEqual(['pin']);
    expect(unpinned.map((t) => t.id)).toEqual(['newer', 'older']);
    expect(concatPinnedUnpinned(p, unpinned).map((t) => t.id)).toEqual(['pin', 'newer', 'older']);
  });
});

describe('nextPinOrder / reindexPinOrders', () => {
  it('appends after max and reindexes 1..n', () => {
    const a = taskStub({ id: 'a', is_pinned: true, pin_order: 1 });
    const b = taskStub({ id: 'b', is_pinned: true, pin_order: 3 });
    expect(nextPinOrder([a, b])).toBe(4);
    expect(reindexPinOrders([b, a]).map((t) => t.pin_order)).toEqual([1, 2]);
  });
});
