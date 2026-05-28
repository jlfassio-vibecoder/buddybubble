/**
 * Outline draft patch — Coach rail structural edits (Sprint 3).
 *
 * Revision contract:
 * - Client sends `task_modal_outline_draft.revision` on each builder message.
 * - Model echoes that revision in `outline_draft_patch.revision`.
 * - Server applies only when `patch.revision >= triggerRevision` (stale patches no-op).
 * - Client applies `outline_draft_applied` only when `applied.revision >= localRevision`,
 *   then bumps local revision to `applied.revision + 1`.
 *
 * Deno mirror: `supabase/functions/agents/coach/outline-draft-patch.ts`.
 * Run `pnpm check:agent-mirror` after edits.
 */

import type { BlockShapeDrop } from './parse';

export type OutlineDraftPatchMode = 'merge_by_name' | 'replace_all';

export type OutlineDraftPatchV1 = {
  v: 1;
  revision: number;
  mode: OutlineDraftPatchMode;
  blocks: Record<string, unknown>[];
  clear_confirmation: boolean;
};

export type OutlineDraftAppliedV1 = {
  v: 1;
  revision: number;
  block_count: number;
  blocks?: Record<string, unknown>[];
  drops?: BlockShapeDrop[];
};

function normalizeBlockName(name: string): string {
  return name.trim().toLowerCase();
}

function isPlainBlock(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

/** Case-insensitive index by `block.name` in outline draft arrays. */
export function findOutlineBlockIndexByName(
  blocks: Record<string, unknown>[],
  blockName: string,
): number {
  const target = normalizeBlockName(blockName);
  if (!target) return -1;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!isPlainBlock(b)) continue;
    const n = typeof b.name === 'string' ? normalizeBlockName(b.name) : '';
    if (n === target) return i;
  }
  return -1;
}

/** Merge patch blocks into base by block name (case-insensitive); append unknown names. */
export function mergeOutlineBlocksByName(
  base: Record<string, unknown>[],
  patch: Record<string, unknown>[],
): Record<string, unknown>[] {
  const next = base.map((b) => ({ ...b }));
  for (const raw of patch) {
    if (!isPlainBlock(raw)) continue;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) continue;
    const idx = findOutlineBlockIndexByName(next, name);
    const merged = { ...raw };
    if (idx >= 0) {
      next[idx] = merged;
    } else {
      next.push(merged);
    }
  }
  return next;
}

export type ApplyOutlineDraftPatchArgs = {
  baseBlocks: Record<string, unknown>[];
  patch: Pick<OutlineDraftPatchV1, 'mode' | 'blocks'>;
};

export function applyOutlineDraftPatch(
  args: ApplyOutlineDraftPatchArgs,
): Record<string, unknown>[] {
  const patchBlocks = args.patch.blocks.filter(isPlainBlock);
  if (args.patch.mode === 'replace_all') {
    return patchBlocks.map((b) => ({ ...b }));
  }
  return mergeOutlineBlocksByName(args.baseBlocks, patchBlocks);
}

/**
 * Server-side stale check. Apply when patch revision is at or after the trigger draft revision.
 * Returns a human-readable reason when stale, else null.
 */
export function outlineDraftPatchStaleReason(
  triggerRevision: number | null,
  patchRevision: number,
): string | null {
  if (triggerRevision == null || !Number.isFinite(triggerRevision)) return null;
  if (!Number.isFinite(patchRevision)) return 'invalid_patch_revision';
  if (patchRevision < Math.max(0, Math.floor(triggerRevision))) {
    return 'patch_revision_behind_trigger';
  }
  return null;
}

/** Client-side stale check before applying agent effect. */
export function outlineDraftAppliedStaleForClient(
  localRevision: number,
  appliedRevision: number,
): boolean {
  if (!Number.isFinite(appliedRevision)) return true;
  return appliedRevision < Math.max(0, Math.floor(localRevision));
}

export function parseOutlineDraftPatchMode(raw: unknown): OutlineDraftPatchMode {
  if (raw === 'replace_all') return 'replace_all';
  return 'merge_by_name';
}

export function parseOutlineDraftPatchRevision(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.floor(raw));
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    return Math.max(0, parseInt(raw.trim(), 10));
  }
  return null;
}

export function buildOutlineDraftAppliedPayload(args: {
  revision: number;
  blocks: Record<string, unknown>[];
  drops?: BlockShapeDrop[];
}): OutlineDraftAppliedV1 {
  const payload: OutlineDraftAppliedV1 = {
    v: 1,
    revision: args.revision,
    block_count: args.blocks.length,
    blocks: args.blocks,
  };
  if (args.drops?.length) payload.drops = args.drops;
  return payload;
}

export function outlineDraftAppliedForRpc(
  payload: OutlineDraftAppliedV1 | null,
): Record<string, unknown> | null {
  if (!payload) return null;
  return payload as unknown as Record<string, unknown>;
}
