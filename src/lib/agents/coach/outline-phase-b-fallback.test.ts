import { describe, expect, it } from 'vitest';

import {
  buildCoachOutlinePhaseBFallback,
  buildFallbackOutlineBlockFromCatalog,
  findBlockCatalogEntryInText,
  inferPlaceholderExercisesFromHints,
  resolveBlockCatalogEntryByToken,
} from './outline-phase-b-fallback';
import { BLOCK_BLUEPRINT_CATALOG } from './block-blueprint-catalog';

describe('outline-phase-b-fallback', () => {
  it('resolves :main/emom/alternating-combo from user text', () => {
    const entry = findBlockCatalogEntryInText(
      'Please write a :main/emom/alternating-combo workout for me',
    );
    expect(entry?.id).toBe('main-emom-alternating-combo');
  });

  it('buildFallbackOutlineBlockFromCatalog hydrates combo EMOM with KB + band placeholders', () => {
    const entry = resolveBlockCatalogEntryByToken(':main/emom/alternating-combo')!;
    const block = buildFallbackOutlineBlockFromCatalog(
      entry,
      'Kettlebell & Band EMOM Combo',
      'A 24-minute EMOM alternating combo for fat loss.',
    );
    expect(block.block_format).toBe('emom');
    const fp = block.format_params as Record<string, unknown>;
    expect(fp.total_minutes).toBe(24);
    expect(fp.is_alternating).toBe(true);
    expect(fp.alternating_stations).toEqual([[0, 1]]);
    expect(block.exercises).toHaveLength(2);
  });

  it('buildCoachOutlinePhaseBFallback uses catalog token from history', () => {
    const blocks = buildCoachOutlinePhaseBFallback({
      triggerContent: 'Proceed with drafting the outline.',
      historyTexts: ['Please write a :main/emom/alternating workout optimized to my goals'],
      title: 'Alternating EMOM',
      description: '20-minute session.',
    });
    expect(blocks).toHaveLength(1);
    const fp = blocks[0]!.format_params as Record<string, unknown>;
    expect(fp.is_alternating).toBe(true);
    expect(fp.alternating_stations).toEqual([[0], [1]]);
  });

  it('inferPlaceholderExercisesFromHints picks kettlebell and band', () => {
    expect(inferPlaceholderExercisesFromHints('Kettlebell and resistance bands session')).toEqual([
      { name: 'Kettlebell Swing' },
      { name: 'Resistance Band Thruster' },
    ]);
  });

  it('minimal fallback when no token in thread', () => {
    const blocks = buildCoachOutlinePhaseBFallback({
      triggerContent: 'yes draft it',
      historyTexts: [],
      title: 'EMOM Session',
      description: '15-minute EMOM',
    });
    expect(blocks[0]!.block_format).toBe('emom');
    expect((blocks[0]!.format_params as Record<string, unknown>).total_minutes).toBe(15);
  });

  it('catalog integrity includes alternating-combo preset', () => {
    expect(BLOCK_BLUEPRINT_CATALOG.some((e) => e.id === 'main-emom-alternating-combo')).toBe(true);
  });
});
