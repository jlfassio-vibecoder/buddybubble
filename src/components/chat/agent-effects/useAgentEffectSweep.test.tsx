import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { COACH_SLUG } from '@/lib/agents/coach/config';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import type { MessageRowWithEmbeddedTask } from '@/types/database';

import { useAgentEffectSweep } from './useAgentEffectSweep';

const COACH_AUTH = 'coach-auth-user';
const TASK_ID = 'task-1';

function makeCoachAgent(): AgentDefinitionLite {
  return {
    id: 'coach-id',
    slug: COACH_SLUG,
    mention_handle: 'Coach',
    display_name: 'Coach',
    avatar_url: null,
    auth_user_id: COACH_AUTH,
    response_timeout_ms: 15_000,
  };
}

function makeCoachMessage(
  id: string,
  metadata: Record<string, unknown>,
): MessageRowWithEmbeddedTask {
  return {
    id,
    user_id: COACH_AUTH,
    metadata,
    created_at: '2026-05-20T02:53:27.886Z',
    tasks: null,
  } as MessageRowWithEmbeddedTask;
}

describe('useAgentEffectSweep', () => {
  it('invokes onCardAction when coach row has card_action but no intake patch', () => {
    const onCardAction = vi.fn();
    const onTaskModalIntakePatch = vi.fn();
    const agents = new Map([[COACH_AUTH, makeCoachAgent()]]);

    renderHook(() =>
      useAgentEffectSweep({
        taskId: TASK_ID,
        isLoading: false,
        messages: [
          makeCoachMessage('msg-trigger', {
            card_action: { v: 1, kind: 'trigger_generation' },
          }),
        ],
        agentsByAuthUserId: agents,
        onTaskModalIntakePatch,
        onCardAction,
      }),
    );

    expect(onTaskModalIntakePatch).not.toHaveBeenCalled();
    expect(onCardAction).toHaveBeenCalledTimes(1);
    expect(onCardAction).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        messageId: 'msg-trigger',
        action: { v: 1, kind: 'trigger_generation' },
      }),
    );
  });

  it('still invokes onCardAction after intake patch is applied on the same message', () => {
    const onCardAction = vi.fn();
    const onTaskModalIntakePatch = vi.fn();
    const agents = new Map([[COACH_AUTH, makeCoachAgent()]]);

    renderHook(() =>
      useAgentEffectSweep({
        taskId: TASK_ID,
        isLoading: false,
        messages: [
          makeCoachMessage('msg-both', {
            task_modal_intake_patch: { duration_minutes: 30 },
            card_action: { v: 1, kind: 'trigger_generation' },
          }),
        ],
        agentsByAuthUserId: agents,
        onTaskModalIntakePatch,
        onCardAction,
      }),
    );

    expect(onTaskModalIntakePatch).toHaveBeenCalledTimes(1);
    expect(onCardAction).toHaveBeenCalledTimes(1);
  });
});
