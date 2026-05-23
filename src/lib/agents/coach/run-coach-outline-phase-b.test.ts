import { describe, expect, it } from 'vitest';
import {
  processCoachOutlinePhaseBVertexOutput,
  buildCoachOutlinePhaseBPrompts,
} from '@/lib/agents/coach/run-coach-outline-phase-b';

describe('run-coach-outline-phase-b', () => {
  it('buildCoachOutlinePhaseBPrompts includes title and description', () => {
    const { userPrompt, systemPrompt } = buildCoachOutlinePhaseBPrompts({
      title: 'Leg Day',
      description: 'Hypertrophy focus',
      userMessage: 'Draft the outline',
    });
    expect(systemPrompt.length).toBeGreaterThan(10);
    expect(userPrompt).toContain('Leg Day');
    expect(userPrompt).toContain('Hypertrophy focus');
  });

  it('processCoachOutlinePhaseBVertexOutput succeeds on valid blocks JSON', () => {
    const result = processCoachOutlinePhaseBVertexOutput({
      text: JSON.stringify({
        blocks: [
          {
            name: 'Main EMOM',
            block_format: 'emom',
            format_params: {
              interval_seconds: 60,
              total_minutes: 12,
              is_alternating: true,
            },
            exercises: [{ name: 'Swing' }, { name: 'Thruster' }],
          },
        ],
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.blocks).toHaveLength(1);
    }
  });

  it('processCoachOutlinePhaseBVertexOutput fails on empty blocks', () => {
    const result = processCoachOutlinePhaseBVertexOutput({
      text: JSON.stringify({ blocks: [] }),
    });
    expect(result.ok).toBe(false);
  });

  it('processCoachOutlinePhaseBVertexOutput fails on MAX_TOKENS', () => {
    const result = processCoachOutlinePhaseBVertexOutput({
      text: '{"blocks":[]}',
      finishReason: 'MAX_TOKENS',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKind).toBe('truncated');
  });
});
