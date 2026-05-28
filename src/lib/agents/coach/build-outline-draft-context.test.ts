import { describe, expect, it } from 'vitest';
import {
  buildOutlineDraftContextBlock,
  buildTaskModalOutlineDraftPayload,
  MAX_OUTLINE_DRAFT_DROPS,
  readTaskModalOutlineDraftFromMessageMetadata,
} from '@/lib/agents/coach/build-outline-draft-context';

describe('buildTaskModalOutlineDraftPayload', () => {
  it('builds v1 payload with revision and blocks', () => {
    const payload = buildTaskModalOutlineDraftPayload({
      revision: 3,
      status: 'ready',
      confirmed: false,
      blocks: [
        {
          name: 'Main EMOM',
          block_format: 'emom',
          format_params: { interval_seconds: 60, total_minutes: 12 },
          exercises: [{ name: 'Burpee' }],
        },
      ],
    });
    expect(payload.v).toBe(1);
    expect(payload.revision).toBe(3);
    expect(payload.blocks).toHaveLength(1);
    expect(payload.confirmed).toBe(false);
  });

  it('caps drops to MAX_OUTLINE_DRAFT_DROPS', () => {
    const drops = Array.from({ length: 10 }, (_, i) => ({
      field: `f${i}`,
      reason: 'circuit_cardinality' as const,
    }));
    const payload = buildTaskModalOutlineDraftPayload({
      revision: 1,
      status: 'needs_structure',
      confirmed: false,
      blocks: [],
      drops,
    });
    expect(payload.drops?.length).toBe(MAX_OUTLINE_DRAFT_DROPS);
  });
});

describe('readTaskModalOutlineDraftFromMessageMetadata', () => {
  it('returns null for invalid metadata', () => {
    expect(readTaskModalOutlineDraftFromMessageMetadata(null)).toBeNull();
    expect(
      readTaskModalOutlineDraftFromMessageMetadata({ task_modal_outline_draft: { v: 2 } }),
    ).toBeNull();
  });

  it('parses metadata when root is a JSON string', () => {
    const draft = buildTaskModalOutlineDraftPayload({
      revision: 1,
      status: 'ready',
      confirmed: false,
      blocks: [{ name: 'Main', block_format: 'emom' }],
    });
    const read = readTaskModalOutlineDraftFromMessageMetadata(
      JSON.stringify({ task_modal_outline_draft: draft }),
    );
    expect(read?.blocks[0]?.name).toBe('Main');
  });

  it('round-trips valid draft', () => {
    const draft = buildTaskModalOutlineDraftPayload({
      revision: 2,
      status: 'ready',
      confirmed: false,
      blocks: [{ name: 'Warm-up', instructions: ['Row'] }],
    });
    const read = readTaskModalOutlineDraftFromMessageMetadata({
      task_modal_outline_draft: draft,
    });
    expect(read?.revision).toBe(2);
    expect(read?.blocks[0]?.name).toBe('Warm-up');
  });
});

describe('buildOutlineDraftContextBlock', () => {
  it('includes block names in prompt text', () => {
    const payload = buildTaskModalOutlineDraftPayload({
      revision: 1,
      status: 'ready',
      confirmed: false,
      blocks: [{ name: 'Finisher Tabata', block_format: 'tabata', format_params: { rounds: 8 } }],
    });
    const block = buildOutlineDraftContextBlock(payload, 'Leg day');
    expect(block).toContain('CURRENT OUTLINE DRAFT');
    expect(block).toContain('Finisher Tabata');
    expect(block).toContain('Leg day');
  });
});
