import { describe, expect, it, vi } from 'vitest';
import { loadBuilderTask } from './load-builder-task';

function makeSupabase(overrides: {
  user?: { id: string } | null;
  membership?: { role: string } | null;
  task?: Record<string, unknown> | null;
  taskError?: { message: string } | null;
  bubble?: { workspace_id: string } | null;
  bubbleError?: { message: string } | null;
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: 'user' in overrides ? overrides.user : { id: 'user-1' },
        },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: overrides.membership ?? { role: 'member' } }),
              }),
            }),
          }),
        };
      }
      if (table === 'tasks') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: overrides.task ?? {
                  id: 'task-1',
                  bubble_id: 'bubble-1',
                  metadata: {},
                  title: 'Test',
                  description: '',
                  item_type: 'workout',
                },
                error: overrides.taskError ?? null,
              }),
            }),
          }),
        };
      }
      if (table === 'bubbles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: overrides.bubble ?? { workspace_id: 'ws-1' },
                error: overrides.bubbleError ?? null,
              }),
            }),
          }),
        };
      }
      return {};
    }),
  } as unknown as Parameters<typeof loadBuilderTask>[0];
}

describe('loadBuilderTask', () => {
  it('returns payload for workout in workspace', async () => {
    const result = await loadBuilderTask(makeSupabase({}), 'ws-1', 'task-1');
    expect(result?.id).toBe('task-1');
    expect(result?.bubble_id).toBe('bubble-1');
    expect(result?.memberRole).toBe('member');
  });

  it('returns null when user missing', async () => {
    const result = await loadBuilderTask(makeSupabase({ user: null }), 'ws-1', 'task-1');
    expect(result).toBeNull();
  });

  it('returns null when item_type is not workout', async () => {
    const result = await loadBuilderTask(
      makeSupabase({
        task: {
          id: 't',
          bubble_id: 'b',
          item_type: 'task',
          metadata: null,
          title: null,
          description: null,
        },
      }),
      'ws-1',
      'task-1',
    );
    expect(result).toBeNull();
  });

  it('returns null when bubble workspace mismatches', async () => {
    const result = await loadBuilderTask(
      makeSupabase({ bubble: { workspace_id: 'other-ws' } }),
      'ws-1',
      'task-1',
    );
    expect(result).toBeNull();
  });
});
