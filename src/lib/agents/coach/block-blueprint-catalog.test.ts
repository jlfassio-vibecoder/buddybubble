import { describe, expect, it } from 'vitest';
import {
  assertCatalogIntegrity,
  BLOCK_BLUEPRINT_CATALOG,
  BLOCK_CATALOG_GROUP_ORDER,
  groupCatalogForDisplay,
  searchBlockCatalog,
} from './block-blueprint-catalog';
import { blockBlueprintMentionFromPick } from './block-blueprint-mentions-client';

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
      tabataHits.every((e) => e.token.includes('tabata') || e.searchAliases.includes('tab')),
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

describe('blockBlueprintMentionFromPick', () => {
  it('preserves explicit catalog token', () => {
    const preset = BLOCK_BLUEPRINT_CATALOG.find((e) => e.id === 'finisher-amrap-metcon');
    expect(preset).toBeDefined();
    const mention = blockBlueprintMentionFromPick(preset!);
    expect(mention.token).toBe(':finisher/amrap/metcon ');
    expect(mention.block_format).toBe('amrap');
    expect(mention.format_params.time_cap_minutes).toBe(5);
  });
});
