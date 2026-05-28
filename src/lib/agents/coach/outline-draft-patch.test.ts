import { describe, expect, it } from 'vitest';
import {
  applyOutlineDraftPatch,
  mergeOutlineBlocksByName,
  outlineDraftAppliedStaleForClient,
  outlineDraftPatchStaleReason,
  parseOutlineDraftPatchRevision,
} from '@/lib/agents/coach/outline-draft-patch';

describe('mergeOutlineBlocksByName', () => {
  it('updates same name in place and appends new names', () => {
    const base = [{ name: 'Warm-up', instructions: ['Row'] }];
    const patch = [
      { name: 'warm-up', instructions: ['Bike'] },
      { name: 'Main', block_format: 'emom', format_params: { interval_seconds: 60 } },
    ];
    const merged = mergeOutlineBlocksByName(base, patch);
    expect(merged).toHaveLength(2);
    expect(merged[0].instructions).toEqual(['Bike']);
    expect(merged[1].name).toBe('Main');
  });
});

describe('applyOutlineDraftPatch', () => {
  it('replace_all replaces entire outline', () => {
    const merged = applyOutlineDraftPatch({
      baseBlocks: [{ name: 'Old' }],
      patch: { mode: 'replace_all', blocks: [{ name: 'New' }] },
    });
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('New');
  });
});

describe('revision gates', () => {
  it('outlineDraftPatchStaleReason when patch behind trigger', () => {
    expect(outlineDraftPatchStaleReason(3, 2)).toBe('patch_revision_behind_trigger');
    expect(outlineDraftPatchStaleReason(3, 3)).toBeNull();
    expect(outlineDraftPatchStaleReason(3, 4)).toBeNull();
  });

  it('outlineDraftAppliedStaleForClient', () => {
    expect(outlineDraftAppliedStaleForClient(5, 4)).toBe(true);
    expect(outlineDraftAppliedStaleForClient(5, 5)).toBe(false);
    expect(outlineDraftAppliedStaleForClient(5, 6)).toBe(false);
  });

  it('parseOutlineDraftPatchRevision', () => {
    expect(parseOutlineDraftPatchRevision(2)).toBe(2);
    expect(parseOutlineDraftPatchRevision('4')).toBe(4);
    expect(parseOutlineDraftPatchRevision(null)).toBeNull();
  });
});
