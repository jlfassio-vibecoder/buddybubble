import type { BlockShapeDrop } from '@/lib/agents/coach/parse';
import type { OutlineDraftAppliedV1 } from '@/lib/agents/coach/outline-draft-patch';

function isPlainBlock(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function parseOutlineDraftAppliedFromMetadata(raw: unknown): OutlineDraftAppliedV1 | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const revRaw = o.revision;
  const revision =
    typeof revRaw === 'number' && Number.isFinite(revRaw)
      ? Math.max(0, Math.floor(revRaw))
      : typeof revRaw === 'string' && /^\d+$/.test(revRaw.trim())
        ? Math.max(0, parseInt(revRaw.trim(), 10))
        : null;
  if (revision === null) return null;
  const blockCountRaw = o.block_count;
  const block_count =
    typeof blockCountRaw === 'number' && Number.isFinite(blockCountRaw)
      ? Math.max(0, Math.floor(blockCountRaw))
      : 0;
  const blocksRaw = o.blocks;
  const blocks = Array.isArray(blocksRaw)
    ? blocksRaw.filter(isPlainBlock).map((b) => ({ ...b }))
    : undefined;
  const dropsRaw = o.drops;
  const drops = Array.isArray(dropsRaw)
    ? (dropsRaw.filter(
        (d) =>
          d &&
          typeof d === 'object' &&
          !Array.isArray(d) &&
          typeof (d as { field?: unknown }).field === 'string' &&
          typeof (d as { reason?: unknown }).reason === 'string',
      ) as BlockShapeDrop[])
    : undefined;
  const payload: OutlineDraftAppliedV1 = { v: 1, revision, block_count };
  if (blocks?.length) payload.blocks = blocks;
  if (drops?.length) payload.drops = drops;
  return payload;
}
