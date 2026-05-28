/**
 * Client `messages.metadata.block_blueprint_mentions` + Coach prompt `BLOCK_BLUEPRINT_REFS`.
 * Mirror: `supabase/functions/agents/coach/block-blueprint-mentions.ts`. Run `pnpm check:agent-mirror`.
 */

import type { BlockFormat } from './block-blueprint-library';

export type BlockSectionRole = 'warmup' | 'main' | 'finisher' | 'cooldown';

export type BlockBlueprintMentionClientPayload = {
  /** Literal substring inserted into the composer, e.g. `:finisher/amrap ` */
  token: string;
  section_name: string;
  section_role: BlockSectionRole;
  block_format: BlockFormat;
  format_params: Record<string, number | string | boolean>;
};

export const BLOCK_BLUEPRINT_REFS_HEADER = '--- BLOCK_BLUEPRINT_REFS ---';

/**
 * Validate `metadata.block_blueprint_mentions` from the trigger message.
 */
export function parseBlockBlueprintMentionsFromMetadata(
  meta: unknown,
): BlockBlueprintMentionClientPayload[] | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const raw = (meta as Record<string, unknown>).block_blueprint_mentions;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const roles = new Set<BlockSectionRole>(['warmup', 'main', 'finisher', 'cooldown']);
  const formats = new Set(['straight_sets', 'superset', 'circuit', 'amrap', 'emom', 'tabata']);
  const out: BlockBlueprintMentionClientPayload[] = [];
  for (const el of raw) {
    if (!el || typeof el !== 'object' || Array.isArray(el)) continue;
    const o = el as Record<string, unknown>;
    if (typeof o.token !== 'string' || !o.token.trim()) continue;
    if (typeof o.section_name !== 'string' || !o.section_name.trim()) continue;
    const role = o.section_role;
    if (typeof role !== 'string' || !roles.has(role as BlockSectionRole)) continue;
    const fmt = o.block_format;
    if (typeof fmt !== 'string' || !formats.has(fmt)) continue;
    const paramsRaw = o.format_params;
    if (!paramsRaw || typeof paramsRaw !== 'object' || Array.isArray(paramsRaw)) continue;
    const format_params: Record<string, number | string | boolean> = {};
    for (const [k, v] of Object.entries(paramsRaw as Record<string, unknown>)) {
      if (typeof v === 'boolean') format_params[k] = v;
      else if (typeof v === 'number' && Number.isFinite(v)) format_params[k] = v;
      else if (typeof v === 'string' && v.trim()) format_params[k] = v.trim();
    }
    out.push({
      token: o.token,
      section_name: o.section_name.trim(),
      section_role: role as BlockSectionRole,
      block_format: fmt as BlockFormat,
      format_params,
    });
  }
  return out.length > 0 ? out : null;
}

export function formatBlockBlueprintRefsPromptBlock(
  mentions: BlockBlueprintMentionClientPayload[],
  options?: { outlineCoPilot?: boolean },
): string | null {
  if (!mentions.length) return null;
  const lines = mentions.map((m) => {
    const params = JSON.stringify(m.format_params);
    return (
      `${JSON.stringify(m.token)} -> section_name=${JSON.stringify(m.section_name)}, ` +
      `section_role=${m.section_role}, block_format=${m.block_format}, format_params=${params}`
    );
  });
  const outlineCoPilot = options?.outlineCoPilot === true;
  const emitTarget = outlineCoPilot
    ? 'outline_draft_patch.blocks (merge_by_name, revision from CURRENT OUTLINE DRAFT)'
    : 'proposed_workout_metadata.blocks as append-only deltas';
  const tail = outlineCoPilot
    ? 'matching section_name, block_format, and format_params exactly. Combine with # exercise tags for exercises[] inside each block. Do not duplicate structure in reply_content alone.'
    : 'one block per ref matching section_name, block_format, and format_params exactly. Combine with # exercise tags in the user message for exercises[] inside each block. Do not duplicate the workout in updated_task_description. Do not re-emit unchanged blocks.';
  return (
    `\n\n${BLOCK_BLUEPRINT_REFS_HEADER}\n` +
    lines.join('\n') +
    `\n\nWhen BLOCK_BLUEPRINT_REFS is present, emit ${emitTarget}: ` +
    tail
  );
}
