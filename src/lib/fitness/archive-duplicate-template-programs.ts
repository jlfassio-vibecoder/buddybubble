import type { SupabaseClient } from '@supabase/supabase-js';
import { parseTaskMetadata } from '@/lib/item-metadata';

/**
 * Soft-archive other unstarted program tasks from the same static template in the same bubble,
 * after the user personalizes one instance (keeps a single customized program visible).
 */
export async function archiveDuplicateProgramsFromSameTemplate(params: {
  supabase: SupabaseClient;
  bubbleId: string;
  keepProgramTaskId: string;
  sourceTemplateId: string;
}): Promise<{ error?: string }> {
  const { supabase, bubbleId, keepProgramTaskId, sourceTemplateId } = params;
  const { data: rows, error: fetchErr } = await supabase
    .from('tasks')
    .select('id, metadata, status')
    .eq('bubble_id', bubbleId)
    .eq('item_type', 'program')
    .is('archived_at', null)
    .neq('id', keepProgramTaskId);

  if (fetchErr) return { error: fetchErr.message };
  const now = new Date().toISOString();

  for (const row of rows ?? []) {
    const m = parseTaskMetadata((row as { metadata: unknown }).metadata) as Record<string, unknown>;
    if (m.source_template_id !== sourceTemplateId) continue;
    const cw = typeof m.current_week === 'number' ? m.current_week : 0;
    if (cw > 0) continue;
    const st = (row as { status: string | null }).status;
    if (st === 'completed') continue;

    const { error: upErr } = await supabase
      .from('tasks')
      .update({ archived_at: now })
      .eq('id', (row as { id: string }).id);
    if (upErr) return { error: upErr.message };
  }
  return {};
}
