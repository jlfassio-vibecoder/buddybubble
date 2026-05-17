import { describe, expect, it } from 'vitest';
import {
  isMainBubbleChannelScope,
  isTaskScopedMessageRow,
  shouldDropRealtimeMessagePayloadForMainBubbleScope,
  type MessageThreadFilter,
} from './message-thread';

describe('message-thread channel isolation', () => {
  const bubbleFilter: MessageThreadFilter = { scope: 'bubble', bubbleId: 'b1' };
  const allFilter: MessageThreadFilter = { scope: 'all_bubbles', bubbleIds: ['b1', 'b2'] };
  const taskFilter: MessageThreadFilter = { scope: 'task', taskId: 't1' };

  it('isMainBubbleChannelScope is true only for bubble and all_bubbles', () => {
    expect(isMainBubbleChannelScope(bubbleFilter)).toBe(true);
    expect(isMainBubbleChannelScope(allFilter)).toBe(true);
    expect(isMainBubbleChannelScope(taskFilter)).toBe(false);
  });

  it('isTaskScopedMessageRow treats null and empty as not task-scoped', () => {
    expect(isTaskScopedMessageRow({ target_task_id: null })).toBe(false);
    expect(isTaskScopedMessageRow({ target_task_id: undefined })).toBe(false);
    expect(isTaskScopedMessageRow({})).toBe(false);
    expect(isTaskScopedMessageRow({ target_task_id: '   ' })).toBe(false);
    expect(isTaskScopedMessageRow({ target_task_id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(
      true,
    );
  });

  it('shouldDropRealtimeMessagePayloadForMainBubbleScope drops task rows in main scopes only', () => {
    const taskRow = { target_task_id: '550e8400-e29b-41d4-a716-446655440000' };
    expect(shouldDropRealtimeMessagePayloadForMainBubbleScope(bubbleFilter, taskRow)).toBe(true);
    expect(shouldDropRealtimeMessagePayloadForMainBubbleScope(allFilter, taskRow)).toBe(true);
    expect(shouldDropRealtimeMessagePayloadForMainBubbleScope(taskFilter, taskRow)).toBe(false);
    expect(
      shouldDropRealtimeMessagePayloadForMainBubbleScope(bubbleFilter, { target_task_id: null }),
    ).toBe(false);
  });
});
