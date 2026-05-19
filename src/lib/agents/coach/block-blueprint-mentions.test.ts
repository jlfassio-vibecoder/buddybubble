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
