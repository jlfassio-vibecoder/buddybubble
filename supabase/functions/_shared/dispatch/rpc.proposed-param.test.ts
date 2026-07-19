import { describe, expect, it } from 'vitest';
import {
  isProposedWorkoutMetadataRpcUnavailable,
  isStructuralPatchRpcUnavailable,
  parseRpcEnvelope,
} from './rpc.ts';

describe('agent_update_task_and_reply optional parameter compatibility', () => {
  it('detects unavailable proposed metadata parameter', () => {
    expect(
      isProposedWorkoutMetadataRpcUnavailable(
        'Could not find the function public.agent_update_task_and_reply(p_proposed_workout_metadata) in the schema cache',
      ),
    ).toBe(true);
  });

  it('detects an ambiguous proposed metadata overload', () => {
    expect(
      isProposedWorkoutMetadataRpcUnavailable(
        'Could not choose the best candidate function between public.agent_update_task_and_reply variants',
      ),
    ).toBe(true);
  });

  it('ignores unrelated RPC errors for proposed metadata', () => {
    expect(
      isProposedWorkoutMetadataRpcUnavailable('agent_update_task_and_reply: invoker mismatch'),
    ).toBe(false);
    expect(isProposedWorkoutMetadataRpcUnavailable(undefined)).toBe(false);
  });

  it('detects unavailable structural patch parameter', () => {
    expect(
      isStructuralPatchRpcUnavailable(
        'Could not find the function public.agent_update_task_and_reply(p_structural_patch) in the schema cache',
      ),
    ).toBe(true);
  });

  it('ignores unrelated RPC errors for structural patches', () => {
    expect(isStructuralPatchRpcUnavailable('agent_update_task_and_reply: invoker mismatch')).toBe(
      false,
    );
    expect(isStructuralPatchRpcUnavailable(undefined)).toBe(false);
  });

  it('surfaces PostgREST details and hint', () => {
    const result = parseRpcEnvelope(null, {
      message: 'Could not find the function',
      code: 'PGRST202',
      details: 'Searched for the function with parameter p_structural_patch',
      hint: 'Perhaps you meant to call agent_update_task_and_reply without p_structural_patch',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Could not find the function');
      expect(result.code).toBe('PGRST202');
      expect(result.details).toBe('Searched for the function with parameter p_structural_patch');
      expect(result.hint).toBe(
        'Perhaps you meant to call agent_update_task_and_reply without p_structural_patch',
      );
    }
  });
});
