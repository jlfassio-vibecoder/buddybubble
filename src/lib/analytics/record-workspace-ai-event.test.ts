import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildOutlineFillEventMetadata,
  outlineFillFailureToEventType,
  recordWorkspaceAiEvent,
  vertexRouteErrorToEventType,
} from '@/lib/analytics/record-workspace-ai-event';
import type { OutlineFillTelemetry } from '@/lib/workout-factory/outline-fill-telemetry';

const mockInsert = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn(() => ({ insert: mockInsert })));

vi.mock('@/lib/supabase-service-role', () => ({
  createServiceRoleClient: () => ({ from: mockFrom }),
}));

describe('outlineFillFailureToEventType', () => {
  it('maps success', () => {
    expect(outlineFillFailureToEventType({ success: true })).toEqual({
      eventType: 'success',
      errorKind: null,
    });
  });

  it('maps success with deterministic fallback', () => {
    expect(outlineFillFailureToEventType({ success: true, fillFallback: true })).toEqual({
      eventType: 'success_fallback',
      errorKind: null,
    });
  });

  it('maps truncated before parse', () => {
    expect(
      outlineFillFailureToEventType({ success: false, truncated: true, failureKind: 'parse' }),
    ).toEqual({ eventType: 'error_truncated', errorKind: 'truncated' });
  });

  it('maps parse and validation failures', () => {
    expect(outlineFillFailureToEventType({ success: false, failureKind: 'parse' })).toEqual({
      eventType: 'error_parse',
      errorKind: 'parse',
    });
    expect(outlineFillFailureToEventType({ success: false, failureKind: 'validation' })).toEqual({
      eventType: 'error_shape',
      errorKind: 'shape',
    });
  });
});

describe('vertexRouteErrorToEventType', () => {
  it('classifies timeout and http errors', () => {
    expect(vertexRouteErrorToEventType(new Error('The operation was abort'))).toEqual({
      eventType: 'error_timeout',
      errorKind: 'timeout',
    });
    expect(vertexRouteErrorToEventType(new Error('AI API error: 503'))).toEqual({
      eventType: 'error_http',
      errorKind: 'http',
    });
  });
});

describe('buildOutlineFillEventMetadata', () => {
  it('includes pipeline telemetry fields', () => {
    const telemetry: OutlineFillTelemetry = {
      pipeline: 'parametric_outline_fill',
      latencyMs: 100,
      attemptCount: 2,
      maxAttempts: 2,
      outlineBlockCount: 3,
      exerciseCount: 8,
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      finishReason: 'length',
      truncated: true,
      model: 'google/gemini-3.1-flash-lite-preview',
      failureKind: 'parse',
      validationReason: 'parse',
      validationError: 'bad json',
    };
    expect(buildOutlineFillEventMetadata(telemetry)).toMatchObject({
      pipeline: 'parametric_outline_fill',
      failure_kind: 'parse',
      validation_reason: 'parse',
      truncated: true,
      outline_block_count: 3,
    });
  });

  it('includes fill_fallback when telemetry used deterministic fallback', () => {
    const telemetry: OutlineFillTelemetry = {
      pipeline: 'parametric_outline_fill',
      latencyMs: 100,
      attemptCount: 2,
      maxAttempts: 2,
      outlineBlockCount: 1,
      exerciseCount: 2,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
      finishReason: 'length',
      truncated: true,
      model: 'google/gemini-3.1-flash-lite-preview',
      fillFallback: true,
      fillFallbackReason: 'parse failed',
    };
    expect(buildOutlineFillEventMetadata(telemetry)).toMatchObject({
      fill_fallback: true,
      fill_fallback_reason: 'parse failed',
    });
  });
});

describe('recordWorkspaceAiEvent', () => {
  beforeEach(() => {
    mockInsert.mockReset();
    mockFrom.mockClear();
    mockInsert.mockResolvedValue({ error: null });
  });

  it('inserts via service role client', async () => {
    await recordWorkspaceAiEvent({
      workspaceId: 'ws-1',
      agentSlug: 'workout_factory',
      surface: 'generate_workout_chain',
      eventType: 'success',
      requestId: 'req-1',
    });

    expect(mockFrom).toHaveBeenCalledWith('workspace_ai_events');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        agent_slug: 'workout_factory',
        event_type: 'success',
        request_id: 'req-1',
      }),
    );
  });

  it('swallows insert errors', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'db down' } });
    await expect(
      recordWorkspaceAiEvent({
        workspaceId: 'ws-1',
        agentSlug: 'workout_factory',
        surface: null,
        eventType: 'error_other',
      }),
    ).resolves.toBeUndefined();
  });
});
