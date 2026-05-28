import { describe, expect, it } from 'vitest';
import {
  shouldSynthesizeOutlineDraftPatch,
  synthesizeOutlineDraftPatchFromBlockIntent,
} from '@/lib/agents/coach/outline-draft-patch-synthesize';

describe('synthesizeOutlineDraftPatchFromBlockIntent', () => {
  it('builds finisher AMRAP patch from catalog token in message text with duration override', () => {
    const patch = synthesizeOutlineDraftPatchFromBlockIntent({
      messageText: 'Now add the 10 minute :finisher/amrap/metcon',
      blockMentions: null,
      revision: 3,
    });
    expect(patch?.revision).toBe(3);
    expect(patch?.mode).toBe('merge_by_name');
    expect(patch?.blocks).toHaveLength(1);
    expect(patch?.blocks[0]?.name).toBe('Finisher');
    expect(patch?.blocks[0]?.block_format).toBe('amrap');
    expect(patch?.blocks[0]?.format_params).toMatchObject({ time_cap_minutes: 10 });
  });

  it('returns null when no catalog token or mentions are present', () => {
    const patch = synthesizeOutlineDraftPatchFromBlockIntent({
      messageText: 'add a finisher please',
      blockMentions: null,
      revision: 1,
    });
    expect(patch).toBeNull();
  });
});

describe('shouldSynthesizeOutlineDraftPatch', () => {
  it('returns true when outline co-pilot patch dropped for missing_blocks', () => {
    expect(
      shouldSynthesizeOutlineDraftPatch({
        outlineCoPilotActive: true,
        hasPatch: false,
        patchDropReasons: ['missing_blocks'],
        messageText: 'hello',
        blockMentions: null,
      }),
    ).toBe(true);
  });

  it('returns false when a valid patch already exists', () => {
    expect(
      shouldSynthesizeOutlineDraftPatch({
        outlineCoPilotActive: true,
        hasPatch: true,
        patchDropReasons: [],
        messageText: ':finisher/amrap/metcon ',
        blockMentions: null,
      }),
    ).toBe(false);
  });
});
