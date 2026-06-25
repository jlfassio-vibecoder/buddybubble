import { describe, expect, it } from 'vitest';
import {
  assertCatalogIntegrity,
  BLOCK_BLUEPRINT_CATALOG,
  BLOCK_CATALOG_GROUP_ORDER,
  groupCatalogForDisplay,
  searchBlockCatalog,
} from './block-blueprint-catalog';
import { blockBlueprintMentionFromPick } from './block-blueprint-mentions-client';
import { applyIntervalPreset } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';
import type { KnownIntervalPresetId } from '@/lib/workout-factory/interval-timer/interval-preset-catalog';

describe('block-blueprint-catalog', () => {
  it('passes integrity checks', () => {
    expect(() => assertCatalogIntegrity()).not.toThrow();
    expect(BLOCK_BLUEPRINT_CATALOG.length).toBeGreaterThanOrEqual(30);
  });

  it('searchBlockCatalog returns full catalog for empty query', () => {
    expect(searchBlockCatalog('')).toHaveLength(BLOCK_BLUEPRINT_CATALOG.length);
    expect(searchBlockCatalog('   ')).toHaveLength(BLOCK_BLUEPRINT_CATALOG.length);
  });

  it('searchBlockCatalog matches tabata via alias and token segment', () => {
    const tab = searchBlockCatalog('tab');
    const tabataHits = tab.filter((e) => e.block_format === 'tabata');
    expect(tabataHits.length).toBeGreaterThan(0);
    expect(
      tabataHits.every(
        (e) =>
          e.token.includes('tabata') ||
          e.token.includes('hiit') ||
          e.token.includes('interval') ||
          e.searchAliases.includes('tab') ||
          e.searchAliases.includes('hiit'),
      ),
    ).toBe(true);
  });

  it('searchBlockCatalog matches core across phases', () => {
    const core = searchBlockCatalog('core');
    expect(core.length).toBeGreaterThan(1);
    expect(core.some((e) => e.token.includes('/core'))).toBe(true);
  });

  it('searchBlockCatalog matches multi-segment finisher/amrap', () => {
    const hits = searchBlockCatalog('finisher/amrap');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((e) => e.token.startsWith(':finisher/') && e.token.includes('/amrap/'))).toBe(
      true,
    );
  });

  it('searchBlockCatalog matches Phase C formats', () => {
    expect(searchBlockCatalog('pyr').length).toBeGreaterThan(0);
    expect(searchBlockCatalog('pyr').every((e) => e.block_format === 'pyramid')).toBe(true);
    expect(searchBlockCatalog('pyramid').length).toBeGreaterThan(0);
    expect(searchBlockCatalog('contrast').some((e) => e.block_format === 'contrast')).toBe(true);
    expect(searchBlockCatalog('cluster').some((e) => e.block_format === 'clusters')).toBe(true);
    expect(searchBlockCatalog('drop').some((e) => e.block_format === 'drop_sets')).toBe(true);
  });

  it('searchBlockCatalog finds EMOM alternating via pacing alias', () => {
    const pacing = searchBlockCatalog('pacing');
    expect(pacing.some((e) => e.id === 'main-emom-alternating')).toBe(true);
    const alt = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'main-emom-alternating');
    expect(alt?.token).toBe(':main/emom/alternating ');
    expect(alt?.format_params.is_alternating).toBe(true);
    expect(alt?.format_params).not.toHaveProperty('alternating_stations');
  });

  it('searchBlockCatalog finds EMOM alternating-combo preset', () => {
    const combo = searchBlockCatalog('combo');
    expect(combo.some((e) => e.id === 'main-emom-alternating-combo')).toBe(true);
    const preset = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'main-emom-alternating-combo');
    expect(preset?.token).toBe(':main/emom/alternating-combo ');
    expect(preset?.format_params.is_alternating).toBe(true);
    expect(preset?.format_params.is_combo).toBe(true);
    expect(preset?.format_params).not.toHaveProperty('alternating_stations');
  });

  it('EMOM catalog includes straight and density tokens', () => {
    const straight = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'main-emom-straight');
    expect(straight?.token).toBe(':main/emom/straight ');
    expect(straight?.format_params.is_alternating).toBe(false);
    const density = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'metcon-emom-density');
    expect(density?.token).toBe(':metcon/emom/density ');
    expect(density?.format_params.is_alternating).toBe(false);
    expect(searchBlockCatalog('threshold').some((e) => e.id === 'metcon-emom-density')).toBe(true);
  });

  it('searchBlockCatalog matches ladder and chipper', () => {
    expect(searchBlockCatalog('ladder').length).toBeGreaterThan(0);
    expect(searchBlockCatalog('ladder').every((e) => e.block_format === 'ladder')).toBe(true);
    expect(searchBlockCatalog('chip').length).toBeGreaterThan(0);
    expect(searchBlockCatalog('chip').some((e) => e.block_format === 'chipper')).toBe(true);
  });

  it('groupCatalogForDisplay emits headers in browse mode', () => {
    const items = groupCatalogForDisplay(BLOCK_BLUEPRINT_CATALOG, { grouped: true });
    const headers = items.filter((i) => i.type === 'header');
    expect(headers.length).toBe(BLOCK_CATALOG_GROUP_ORDER.length);
    expect(items[0]?.type).toBe('header');
    expect(items[0]?.type === 'header' ? items[0].title : '').toBe('MAIN');
  });

  it('groupCatalogForDisplay is flat when grouped is false', () => {
    const items = groupCatalogForDisplay(BLOCK_BLUEPRINT_CATALOG, { grouped: false });
    expect(items.every((i) => i.type === 'entry')).toBe(true);
    expect(items).toHaveLength(BLOCK_BLUEPRINT_CATALOG.length);
  });
});

describe('interval preset catalog rows', () => {
  const INTERVAL_PRESET_ROWS: { id: string; presetId: KnownIntervalPresetId }[] = [
    { id: 'finisher-classic-hiit', presetId: 'classic_hiit' },
    { id: 'finisher-hypertrophy-density', presetId: 'hypertrophy_density' },
    { id: 'cardio-heavy-aerobic', presetId: 'heavy_aerobic' },
    { id: 'main-power-sprints', presetId: 'power_sprints' },
    { id: 'main-fighters-rounds', presetId: 'fighters' },
  ];

  it('passes catalog integrity with new interval preset rows', () => {
    expect(() => assertCatalogIntegrity()).not.toThrow();
  });

  it.each(INTERVAL_PRESET_ROWS)(
    '$id format_params match applyIntervalPreset($presetId)',
    ({ id, presetId }) => {
      const row = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === id);
      expect(row).toBeDefined();
      expect(row?.block_format).toBe('tabata');
      expect(row?.format_params).toEqual(applyIntervalPreset(presetId));
    },
  );

  it('searchBlockCatalog finds interval preset tokens by path segments', () => {
    expect(searchBlockCatalog('hiit/classic').some((e) => e.id === 'finisher-classic-hiit')).toBe(
      true,
    );
    expect(searchBlockCatalog('interval/power').some((e) => e.id === 'main-power-sprints')).toBe(
      true,
    );
  });

  it('blockBlueprintMentionFromPick carries classic HIIT preset params', () => {
    const preset = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'finisher-classic-hiit');
    expect(preset).toBeDefined();
    const mention = blockBlueprintMentionFromPick(preset!);
    expect(mention.token).toBe(':finisher/hiit/classic ');
    expect(mention.block_format).toBe('tabata');
    expect(mention.format_params).toEqual(applyIntervalPreset('classic_hiit'));
  });
});

describe('blockBlueprintMentionFromPick', () => {
  it('carries is_alternating from alternating EMOM preset', () => {
    const preset = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'main-emom-alternating');
    expect(preset).toBeDefined();
    const mention = blockBlueprintMentionFromPick(preset!);
    expect(mention.token).toBe(':main/emom/alternating ');
    expect(mention.format_params.is_alternating).toBe(true);
    expect(mention.format_params).not.toHaveProperty('alternating_stations');
  });

  it('carries is_combo from alternating-combo EMOM preset', () => {
    const preset = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'main-emom-alternating-combo');
    expect(preset).toBeDefined();
    const mention = blockBlueprintMentionFromPick(preset!);
    expect(mention.token).toBe(':main/emom/alternating-combo ');
    expect(mention.format_params.is_alternating).toBe(true);
    expect(mention.format_params.is_combo).toBe(true);
  });

  it('preserves explicit catalog token', () => {
    const preset = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'finisher-amrap-metcon');
    expect(preset).toBeDefined();
    const mention = blockBlueprintMentionFromPick(preset!);
    expect(mention.token).toBe(':finisher/amrap/metcon ');
    expect(mention.block_format).toBe('amrap');
    expect(mention.format_params.time_cap_minutes).toBe(5);
  });
});
