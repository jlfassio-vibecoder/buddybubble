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

  it('system prompt requires one block per structural catalog token', () => {
    const { systemPrompt } = buildCoachOutlinePhaseBPrompts({
      title: 'Tabata',
      description: 'Integrated session',
      userMessage: ':main/tabata/power',
    });
    expect(systemPrompt).toContain('STRUCTURAL TOKEN PARITY');
    expect(systemPrompt).toContain('one separate, distinct block');
  });

  it('user prompt maps every catalog token to a blocks entry', () => {
    const tabataTokens = ':main/tabata/power , :finisher/tabata/vo2 and :finisher/tabata/core';
    const { userPrompt } = buildCoachOutlinePhaseBPrompts({
      title: 'Tabata Session',
      description: 'High-intensity Tabata intervals for power, VO2, and core.',
      userMessage: `I'd like a workout with ${tabataTokens} using kettlebells and TRX.`,
      blueprintLibraryPrompt: '',
    });
    expect(userPrompt).toContain('CATALOG TOKEN MAPPING (CRITICAL)');
    expect(userPrompt).toContain('blocks.length MUST equal the token count');
    expect(userPrompt).toContain('TOKEN SOURCE OF TRUTH');
    expect(userPrompt).toContain('Main — Tabata Power');
    expect(userPrompt).toContain('Finisher — Tabata VO2');
    expect(userPrompt).toContain('Finisher — Tabata Core');
    expect(userPrompt).toContain(tabataTokens);
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
