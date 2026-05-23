import { describe, expect, it } from 'vitest';
import { BLOCK_BLUEPRINT_CATALOG } from '@/lib/agents/coach/block-blueprint-catalog';
import {
  catalogPresetToOutlineBlock,
  createInstructionBlock,
  normalizeOutlineDraft,
  outlineBlockSummary,
  validateOutlineDraftForConfirm,
} from '@/lib/agents/coach/outline-editor-client';
import { ensureOutlineExercisePlaceholders } from '@/lib/agents/coach/outline-exercise-placeholders';

describe('outline-editor-client', () => {
  it('catalogPresetToOutlineBlock seeds superset with two placeholders', () => {
    const preset = BLOCK_BLUEPRINT_CATALOG.find((e) => e.block_format === 'superset');
    expect(preset).toBeDefined();
    const block = catalogPresetToOutlineBlock(preset!);
    expect(block.block_format).toBe('superset');
    expect(Array.isArray(block.exercises)).toBe(true);
    expect((block.exercises as unknown[]).length).toBe(2);
  });

  it('createInstructionBlock returns instruction-only shape', () => {
    const block = createInstructionBlock('Warm-up', ['Row 500m', 'Dynamic prep']);
    expect(block.name).toBe('Warm-up');
    expect(block.instructions).toEqual(['Row 500m', 'Dynamic prep']);
    expect(block.block_format).toBeUndefined();
  });

  it('normalizeOutlineDraft validates EMOM block', () => {
    const { blocks, drops } = normalizeOutlineDraft([
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: {
          interval_seconds: 60,
          total_minutes: 10,
          is_alternating: true,
        },
        exercises: [{ name: 'Swing' }, { name: 'Thruster' }],
      },
    ]);
    expect(drops).toHaveLength(0);
    expect(blocks).toHaveLength(1);
  });

  it('validateOutlineDraftForConfirm rejects empty draft', () => {
    const result = validateOutlineDraftForConfirm([]);
    expect(result.ok).toBe(false);
  });

  it('outlineBlockSummary includes format label', () => {
    const summary = outlineBlockSummary({
      name: 'Finisher',
      block_format: 'tabata',
      format_params: { rounds: 8 },
      exercises: [{ name: 'Burpee' }],
    });
    expect(summary).toContain('Finisher');
    expect(summary).toContain('Tabata');
  });

  it('ensureOutlineExercisePlaceholders fills EMOM block with no exercises', () => {
    const out = ensureOutlineExercisePlaceholders([
      {
        name: 'Main EMOM',
        block_format: 'emom',
        format_params: { interval_seconds: 60, total_minutes: 10, is_alternating: true },
      },
    ]);
    expect(Array.isArray(out[0].exercises)).toBe(true);
    expect((out[0].exercises as unknown[]).length).toBeGreaterThan(0);
  });
});
