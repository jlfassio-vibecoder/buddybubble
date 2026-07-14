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
                maybeSingle: vi.fn().mockResolvedValue({
                  data: 'membership' in overrides ? overrides.membership : { role: 'member' },
                }),
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
                data:
                  'task' in overrides
                    ? overrides.task
                    : {
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
                data: 'bubble' in overrides ? overrides.bubble : { workspace_id: 'ws-1' },
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
  it('returns ok payload for workout in workspace', async () => {
    const result = await loadBuilderTask(makeSupabase({}), 'ws-1', 'task-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.task.id).toBe('task-1');
    expect(result.task.bubble_id).toBe('bubble-1');
    expect(result.task.memberRole).toBe('member');
  });

  it('returns unauthenticated when user missing', async () => {
    const result = await loadBuilderTask(makeSupabase({ user: null }), 'ws-1', 'task-1');
    expect(result).toEqual({ ok: false, reason: 'unauthenticated' });
  });

  it('returns not_member when membership missing', async () => {
    const result = await loadBuilderTask(makeSupabase({ membership: null }), 'ws-1', 'task-1');
    expect(result).toEqual({ ok: false, reason: 'not_member' });
  });

  it('returns task_not_found when task missing', async () => {
    const result = await loadBuilderTask(makeSupabase({ task: null }), 'ws-1', 'task-1');
    expect(result).toEqual({ ok: false, reason: 'task_not_found' });
  });

  it('returns not_workout when item_type is not workout', async () => {
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
    expect(result).toEqual({ ok: false, reason: 'not_workout' });
  });

  it('returns workspace_mismatch when bubble workspace mismatches', async () => {
    const result = await loadBuilderTask(
      makeSupabase({ bubble: { workspace_id: 'other-ws' } }),
      'ws-1',
      'task-1',
    );
    expect(result).toEqual({ ok: false, reason: 'workspace_mismatch' });
  });
});
