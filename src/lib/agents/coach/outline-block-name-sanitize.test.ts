import { describe, expect, it } from 'vitest';
import type { BlockShapeDrop } from '@/lib/agents/coach/parse';
import {
  clampOutlineBlockName,
  isVerboseOutlineBlockName,
  sanitizeOutlineBlockName,
  sanitizeOutlinePatchBlocks,
} from '@/lib/agents/coach/outline-block-name-sanitize';

describe('clampOutlineBlockName', () => {
  it('collapses whitespace and truncates long names', () => {
    const long = 'Main   Circuit   Block   With   Many   Words   Here   Extra';
    const out = clampOutlineBlockName(long);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out).not.toContain('  ');
  });
});

describe('isVerboseOutlineBlockName', () => {
  it('flags timing and format prose in name', () => {
    expect(isVerboseOutlineBlockName('Main Circuit 1 (AMRAP 15 min.) - 4 Exercises')).toBe(true);
  });

  it('allows short format labels like Main AMRAP', () => {
    expect(isVerboseOutlineBlockName('Main AMRAP')).toBe(false);
  });

  it('allows short section labels', () => {
    expect(isVerboseOutlineBlockName('Main Circuit')).toBe(false);
    expect(isVerboseOutlineBlockName('Warm-up')).toBe(false);
    expect(isVerboseOutlineBlockName('Main — Functional Circuit')).toBe(false);
    expect(isVerboseOutlineBlockName('Main - Functional Circuit')).toBe(false);
  });
});

describe('sanitizeOutlineBlockName', () => {
  it('drops verbose names', () => {
    const drops: BlockShapeDrop[] = [];
    const r = sanitizeOutlineBlockName(
      'Main Circuit 1 (AMRAP 15 min.) - 4 Exercises Each Block',
      'blocks[0].name',
      drops,
    );
    expect(r.dropped).toBe(true);
    expect(r.name).toBeNull();
    expect(drops.some((d) => d.reason === 'block_name_too_verbose')).toBe(true);
  });

  it('clamps long but non-verbose names', () => {
    const drops: BlockShapeDrop[] = [];
    const long = 'Finisher Block Alpha Beta Gamma Delta Epsilon Zeta';
    const r = sanitizeOutlineBlockName(long, 'blocks[0].name', drops);
    expect(r.dropped).toBe(false);
    expect(r.name).toBeTruthy();
    expect((r.name ?? '').length).toBeLessThanOrEqual(40);
    expect(drops.some((d) => d.reason === 'block_name_clamped')).toBe(true);
  });
});

describe('sanitizeOutlinePatchBlocks', () => {
  it('keeps valid patch blocks and drops verbose', () => {
    const { blocks, drops } = sanitizeOutlinePatchBlocks(
      [
        { name: 'Main AMRAP', block_format: 'amrap', format_params: { time_cap_minutes: 15 } },
        { name: 'Bad (AMRAP 15 min) with 4 exercises listed in name' },
      ],
      'outline_draft_patch.blocks',
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.name).toBe('Main AMRAP');
    expect(drops.some((d) => d.reason === 'block_name_too_verbose')).toBe(true);
  });
});
