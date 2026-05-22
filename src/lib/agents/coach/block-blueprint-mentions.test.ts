import { describe, expect, it } from 'vitest';
import {
  BLOCK_BLUEPRINT_REFS_HEADER,
  formatBlockBlueprintRefsPromptBlock,
  parseBlockBlueprintMentionsFromMetadata,
} from './block-blueprint-mentions';

describe('parseBlockBlueprintMentionsFromMetadata', () => {
  it('returns null for empty or invalid', () => {
    expect(parseBlockBlueprintMentionsFromMetadata(null)).toBeNull();
    expect(parseBlockBlueprintMentionsFromMetadata({ block_blueprint_mentions: [] })).toBeNull();
  });

  it('parses boolean format_params', () => {
    const rows = parseBlockBlueprintMentionsFromMetadata({
      block_blueprint_mentions: [
        {
          token: ':main/emom/alternating ',
          section_name: 'Main',
          section_role: 'main',
          block_format: 'emom',
          format_params: {
            interval_seconds: 60,
            total_minutes: 10,
            is_alternating: true,
          },
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows![0].format_params.is_alternating).toBe(true);
    expect(rows![0].format_params.interval_seconds).toBe(60);
  });

  it('parses valid mention rows', () => {
    const rows = parseBlockBlueprintMentionsFromMetadata({
      block_blueprint_mentions: [
        {
          token: ':finisher/amrap ',
          section_name: 'Finisher',
          section_role: 'finisher',
          block_format: 'amrap',
          format_params: { time_cap_minutes: 5 },
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows![0].block_format).toBe('amrap');
  });
});

describe('formatBlockBlueprintRefsPromptBlock', () => {
  it('includes header and append-only instruction', () => {
    const block = formatBlockBlueprintRefsPromptBlock([
      {
        token: ':finisher/amrap ',
        section_name: 'Finisher',
        section_role: 'finisher',
        block_format: 'amrap',
        format_params: { time_cap_minutes: 5 },
      },
    ]);
    expect(block).toContain(BLOCK_BLUEPRINT_REFS_HEADER);
    expect(block).toContain('append-only');
    expect(block).toContain('time_cap_minutes');
  });
});
