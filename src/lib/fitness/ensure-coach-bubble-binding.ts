import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Binds the workspace-global Coach (`agent_definitions.slug = 'coach'`) to one or more bubbles
 * so `bubble_agent_bindings` + RPCs (`agent_create_card_and_reply`) stay consistent.
 *
 * Idempotent: upserts on `(bubble_id, agent_definition_id)` so repeated calls re-enable / refresh rows.
 */
export async function ensureCoachBubbleBindings(
  supabase: SupabaseClient,
  bubbleIds: readonly string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (bubbleIds.length === 0) {
    return { ok: true };
  }

  const { data: coach, error: coachErr } = await supabase
    .from('agent_definitions')
    .select('id')
    .eq('slug', 'coach')
    .eq('is_active', true)
    .maybeSingle();

  if (coachErr) {
    return { ok: false, error: coachErr.message };
  }
  if (!coach?.id) {
    return { ok: false, error: 'Active Coach agent (slug coach) is not provisioned.' };
  }

  const rows = bubbleIds.map((bubble_id) => ({
    bubble_id,
    agent_definition_id: coach.id,
    sort_order: 0,
    enabled: true,
  }));

  const { error: bindErr } = await supabase.from('bubble_agent_bindings').upsert(rows, {
    onConflict: 'bubble_id,agent_definition_id',
  });

  if (bindErr) {
    return { ok: false, error: bindErr.message };
  }
  return { ok: true };
}
