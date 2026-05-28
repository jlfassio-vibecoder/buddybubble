import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { COACH_SLUG } from '@/lib/agents/coach/config';
import type { AgentDefinitionLite } from '@/lib/agents/resolveTargetAgent';
import type { MessageRowWithEmbeddedTask } from '@/types/database';

import { useAgentEffectSweep, type UseAgentEffectSweepArgs } from './useAgentEffectSweep';

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

  it('still invokes onCardAction when duplicate coach row id already handled outline this run', () => {
    const onOutlineDraftApplied = vi.fn();
    const onCardAction = vi.fn();
    const agents = new Map([[COACH_AUTH, makeCoachAgent()]]);
    const metadata = {
      outline_draft_applied: {
        v: 1,
        revision: 1,
        block_count: 1,
        blocks: [{ name: 'Main', block_format: 'emom' }],
      },
      card_action: { v: 1, kind: 'trigger_generation' },
    };

    renderHook(() =>
      useAgentEffectSweep({
        taskId: TASK_ID,
        isLoading: false,
        messages: [makeCoachMessage('msg-dup', metadata), makeCoachMessage('msg-dup', metadata)],
        agentsByAuthUserId: agents,
        onOutlineDraftApplied,
        onCardAction,
      }),
    );

    expect(onOutlineDraftApplied).toHaveBeenCalledTimes(1);
    expect(onCardAction).toHaveBeenCalledTimes(1);
  });

  it('marks missing card_action as handled so parse_dropped is not re-emitted every sweep', () => {
    const onEffectTelemetry = vi.fn();
    const agents = new Map([[COACH_AUTH, makeCoachAgent()]]);
    const messages = [makeCoachMessage('msg-no-card', { reply_kind: 'coach' })];

    const { rerender } = renderHook(
      (props: UseAgentEffectSweepArgs) => useAgentEffectSweep(props),
      {
        initialProps: {
          taskId: TASK_ID,
          isLoading: false,
          messages,
          agentsByAuthUserId: agents,
          onCardAction: vi.fn(),
          onEffectTelemetry,
        },
      },
    );

    const dropEvents = () =>
      onEffectTelemetry.mock.calls.filter(
        ([event]) =>
          event.kind === 'effect.parse_dropped' &&
          event.effect === 'card_action' &&
          event.messageId === 'msg-no-card',
      );

    expect(dropEvents()).toHaveLength(1);

    rerender({
      taskId: TASK_ID,
      isLoading: false,
      messages: [...messages],
      agentsByAuthUserId: agents,
      onCardAction: vi.fn(),
      onEffectTelemetry,
    });

    expect(dropEvents()).toHaveLength(1);
  });

  it('invokes onOutlineDraftApplied when coach row has outline_draft_applied', () => {
    const onOutlineDraftApplied = vi.fn();
    const agents = new Map([[COACH_AUTH, makeCoachAgent()]]);

    renderHook(() =>
      useAgentEffectSweep({
        taskId: TASK_ID,
        isLoading: false,
        messages: [
          makeCoachMessage('msg-outline', {
            outline_draft_applied: {
              v: 1,
              revision: 2,
              block_count: 1,
              blocks: [{ name: 'Main EMOM', block_format: 'emom' }],
            },
          }),
        ],
        agentsByAuthUserId: agents,
        onOutlineDraftApplied,
      }),
    );

    expect(onOutlineDraftApplied).toHaveBeenCalledTimes(1);
    expect(onOutlineDraftApplied).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: TASK_ID,
        messageId: 'msg-outline',
        applied: expect.objectContaining({ revision: 2, block_count: 1 }),
      }),
    );
  });
});
