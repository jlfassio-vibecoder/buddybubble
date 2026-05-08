/**
 * Self-tests for `scripts/check-agent-prompt-schema-drift.ts`.
 *
 * Two layers:
 *   1. Live-registry baseline: the production registry (Coach main + greeting,
 *      Buddy, Organizer) must always exit clean. This codifies the snapshot at
 *      Phase 7a merge time as the floor.
 *   2. Synthetic-contract negative tests: hand-crafted contracts that violate
 *      each rule direction once, asserting the runner reports exactly that
 *      violation with the documented rule id and key.
 *
 * Direction-C negative tests reuse `src/lib/agents/buddy/parse.ts` as a stable
 * parser source and choose a synthetic required key the file is known not to
 * reference. This avoids temp-file management.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';

import { runCheck, type Contract } from './check-agent-prompt-schema-drift';

const REPO_ROOT = path.resolve(__dirname, '..');

describe('check-agent-prompt-schema-drift — live registry baseline', () => {
  it('passes with zero violations against the production registry', async () => {
    const violations = await runCheck({ cwd: REPO_ROOT });
    expect(violations).toEqual([]);
  });
});

describe('check-agent-prompt-schema-drift — direction A (required ⊆ prompt)', () => {
  it('flags a required key that is absent from the prompt', async () => {
    const synthetic: Contract = {
      name: 'synthetic.directionA',
      slug: 'coach',
      schema: {
        type: 'OBJECT',
        properties: {
          missingFromPrompt: { type: 'STRING' },
        },
        required: ['missingFromPrompt'],
      },
      // Intentionally vacuous prompt — no token mention of `missingFromPrompt`.
      prompt: 'You are a fictional agent. Reply concisely.',
      // Stable parser source that DOES contain the literal token (so direction C
      // does not double-fire and confuse the assertion below).
      parserSourcePath: 'scripts/check-agent-prompt-schema-drift.ts',
    };
    const violations = await runCheck({ cwd: REPO_ROOT, registry: [synthetic] });
    const directionA = violations.filter((v) => v.ruleId === 'required-key-missing-from-prompt');
    expect(directionA).toHaveLength(1);
    expect(directionA[0]!.key).toBe('missingFromPrompt');
    expect(directionA[0]!.contract).toBe('synthetic.directionA');
  });

  it('respects schemaOnlyKeys to suppress direction A', async () => {
    const synthetic: Contract = {
      name: 'synthetic.directionA.allowlisted',
      slug: 'coach',
      schema: {
        type: 'OBJECT',
        properties: { intentionallyImplicit: { type: 'STRING' } },
        required: ['intentionallyImplicit'],
      },
      prompt: 'You are a fictional agent. Write one sentence.',
      parserSourcePath: 'scripts/check-agent-prompt-schema-drift.ts',
      schemaOnlyKeys: ['intentionallyImplicit'],
    };
    const violations = await runCheck({ cwd: REPO_ROOT, registry: [synthetic] });
    const directionA = violations.filter((v) => v.ruleId === 'required-key-missing-from-prompt');
    expect(directionA).toEqual([]);
  });
});

describe('check-agent-prompt-schema-drift — direction B (prompt-key ⊆ schema/enum/allowlist)', () => {
  it('flags a prompt token that looks like a schema key but is not declared', async () => {
    const synthetic: Contract = {
      name: 'synthetic.directionB',
      slug: 'coach',
      schema: {
        type: 'OBJECT',
        properties: { newName: { type: 'STRING' } },
        required: ['newName'],
      },
      // Prompt mentions `newName` (legitimate, schema key) AND `oldRenamedKey` (orphan
      // from a refactor — not in schema, should fail direction B).
      prompt: 'You are an agent. Set newName to a value. Do not use oldRenamedKey anymore.',
      parserSourcePath: 'scripts/check-agent-prompt-schema-drift.ts',
    };
    const violations = await runCheck({ cwd: REPO_ROOT, registry: [synthetic] });
    const directionB = violations.filter((v) => v.ruleId === 'prompt-key-missing-from-schema');
    expect(directionB).toHaveLength(1);
    expect(directionB[0]!.key).toBe('oldRenamedKey');
  });

  it('respects promptOnlyTokens to suppress direction B', async () => {
    const synthetic: Contract = {
      name: 'synthetic.directionB.allowlisted',
      slug: 'coach',
      schema: {
        type: 'OBJECT',
        properties: { newName: { type: 'STRING' } },
        required: ['newName'],
      },
      prompt: 'You are an agent. Reference newName and runtimeContextBlock if available.',
      parserSourcePath: 'scripts/check-agent-prompt-schema-drift.ts',
      promptOnlyTokens: ['runtimeContextBlock'],
    };
    const violations = await runCheck({ cwd: REPO_ROOT, registry: [synthetic] });
    const directionB = violations.filter((v) => v.ruleId === 'prompt-key-missing-from-schema');
    expect(directionB).toEqual([]);
  });

  it('treats schema enum values as known tokens (no direction-B false positive)', async () => {
    const synthetic: Contract = {
      name: 'synthetic.directionB.enum',
      slug: 'coach',
      schema: {
        type: 'OBJECT',
        properties: {
          phase: {
            type: 'STRING',
            enum: ['enum_value_one', 'enum_value_two'],
          },
        },
        required: ['phase'],
      },
      prompt: 'You are an agent. Set phase to either enum_value_one or enum_value_two. Pick one.',
      parserSourcePath: 'scripts/check-agent-prompt-schema-drift.ts',
    };
    const violations = await runCheck({ cwd: REPO_ROOT, registry: [synthetic] });
    expect(violations.filter((v) => v.ruleId === 'prompt-key-missing-from-schema')).toEqual([]);
  });
});

describe('check-agent-prompt-schema-drift — direction C (required ⊆ parser source)', () => {
  it('flags a required key that the parser source never references', async () => {
    const synthetic: Contract = {
      name: 'synthetic.directionC',
      slug: 'buddy',
      schema: {
        type: 'OBJECT',
        properties: { ghostKeyNotInParser: { type: 'STRING' } },
        required: ['ghostKeyNotInParser'],
      },
      // Mention `ghostKeyNotInParser` in the prompt so direction A does not also fire.
      prompt: 'You are an agent. Always emit ghostKeyNotInParser as a string.',
      // Buddy's real parser file — known not to reference this synthetic key.
      parserSourcePath: 'src/lib/agents/buddy/parse.ts',
    };
    const violations = await runCheck({ cwd: REPO_ROOT, registry: [synthetic] });
    const directionC = violations.filter((v) => v.ruleId === 'required-key-missing-from-parser');
    expect(directionC).toHaveLength(1);
    expect(directionC[0]!.key).toBe('ghostKeyNotInParser');
  });
});
