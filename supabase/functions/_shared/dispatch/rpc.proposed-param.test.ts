import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isProposedWorkoutMetadataRpcUnavailable,
  isStructuralPatchRpcUnavailable,
  parseRpcEnvelope,
} from './rpc.ts';

Deno.test('isProposedWorkoutMetadataRpcUnavailable detects PGRST202 with param name', () => {
  assertEquals(
    isProposedWorkoutMetadataRpcUnavailable(
      'Could not find the function public.agent_update_task_and_reply(p_proposed_workout_metadata) in the schema cache',
    ),
    true,
  );
});

Deno.test('isProposedWorkoutMetadataRpcUnavailable detects ambiguous overload', () => {
  assertEquals(
    isProposedWorkoutMetadataRpcUnavailable(
      'Could not choose the best candidate function between public.agent_update_task_and_reply variants',
    ),
    true,
  );
});

Deno.test('isProposedWorkoutMetadataRpcUnavailable ignores unrelated RPC errors', () => {
  assertEquals(
    isProposedWorkoutMetadataRpcUnavailable('agent_update_task_and_reply: invoker mismatch'),
    false,
  );
  assertEquals(isProposedWorkoutMetadataRpcUnavailable(undefined), false);
});

Deno.test('isStructuralPatchRpcUnavailable detects PGRST202 with param name', () => {
  assertEquals(
    isStructuralPatchRpcUnavailable(
      'Could not find the function public.agent_update_task_and_reply(p_structural_patch) in the schema cache',
    ),
    true,
  );
});

Deno.test('isStructuralPatchRpcUnavailable ignores invoker mismatch', () => {
  assertEquals(
    isStructuralPatchRpcUnavailable('agent_update_task_and_reply: invoker mismatch'),
    false,
  );
  assertEquals(isStructuralPatchRpcUnavailable(undefined), false);
});

Deno.test('parseRpcEnvelope surfaces PostgREST details and hint', () => {
  const result = parseRpcEnvelope(null, {
    message: 'Could not find the function',
    code: 'PGRST202',
    details: 'Searched for the function with parameter p_structural_patch',
    hint: 'Perhaps you meant to call agent_update_task_and_reply without p_structural_patch',
  });
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.error, 'Could not find the function');
    assertEquals(result.code, 'PGRST202');
    assertEquals(result.details, 'Searched for the function with parameter p_structural_patch');
    assertEquals(
      result.hint,
      'Perhaps you meant to call agent_update_task_and_reply without p_structural_patch',
    );
  }
});
