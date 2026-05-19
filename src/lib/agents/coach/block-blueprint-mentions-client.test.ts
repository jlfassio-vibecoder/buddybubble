import { describe, expect, it } from 'vitest';
import {
  blockBlueprintMentionFromPick,
  BLOCK_PICKER_PRESETS,
  filterBlockPickerPresets,
} from './block-blueprint-mentions-client';

describe('block-blueprint-mentions-client', () => {
  it('BLOCK_PICKER_PRESETS includes catalog tokens', () => {
    expect(BLOCK_PICKER_PRESETS.length).toBeGreaterThanOrEqual(30);
    expect(BLOCK_PICKER_PRESETS[0]?.token).toMatch(/^:[\w-]+\/[\w-]+\/[\w-]+ $/);
  });

  it('filterBlockPickerPresets delegates to catalog search', () => {
    const filtered = filterBlockPickerPresets(BLOCK_PICKER_PRESETS, 'tab');
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.some((p) => p.block_format === 'tabata')).toBe(true);
  });

  it('blockBlueprintMentionFromPick uses preset.token not derived 2-part token', () => {
    const preset = BLOCK_PICKER_PRESETS.find((p) => p.id === 'finisher-tabata-vo2');
    expect(preset?.token).toBe(':finisher/tabata/vo2 ');
    const mention = blockBlueprintMentionFromPick(preset!);
    expect(mention.token).toBe(':finisher/tabata/vo2 ');
  });
});
