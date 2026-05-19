/**
 * Tests the **persistence** half of the Phase 12 `card_action` contract.
 *
 * Why a dedicated file: `index.integration.test.ts` proves the Edge function
 * passes `p_card_action` to the RPC. That assertion alone is what let the SQL
 * regression in `20260827120000_*` ship: `card_action` was nested inside the
 * `task_modal_intake_patch` guard and silently dropped on the metadata write.
 *
 * This file closes that gap with two complementary checks:
 *
 *   1. **SQL structure regression** — read the fix migration and assert each
 *      optional payload's `if ... then ... end if;` block sits at the top level
 *      of the metadata composition section, never nested inside a sibling.
 *
 *   2. **Persistence simulator** — exercise the TS simulator that mirrors the
 *      SQL function's merge logic (`agent-rpc-persistence-simulator.ts`). The
 *      simulator is the contract the SQL is required to honor; the end-to-end
 *      tests in `index.integration.test.ts` feed real RPC args through it to
 *      assert the persisted shape.
 *
 * Run: `pnpm run test:deno-integration`.
 */

import { assert, assertEquals, assertExists } from 'jsr:@std/assert@1';

import {
  simulateCoachDraftReplyMetadata,
  simulateCreateCardReplyMetadata,
  simulateUpdateTaskReplyMetadata,
} from '../_shared/test-helpers/agent-rpc-persistence-simulator.ts';

const TRIGGER_GENERATION = { v: 1, kind: 'trigger_generation' } as const;

// ---------------------------------------------------------------------------
// Section 1 — SQL structure regression. Locks the migration pattern in place.
// ---------------------------------------------------------------------------

const FIX_MIGRATION_URL = new URL(
  '../../migrations/20260828120000_fix_card_action_sibling_merge.sql',
  import.meta.url,
);

async function readFixMigration(): Promise<string> {
  return await Deno.readTextFile(FIX_MIGRATION_URL);
}

Deno.test(
  'fix migration: card_action is merged as a sibling, never nested under intake',
  async () => {
    const sql = await readFixMigration();

    // The bug shape: an `if p_card_action ...` block appearing **inside** an `if
    // p_task_modal_intake_patch ... then` block (no intervening `end if;`).
    const buggyPattern =
      /if p_task_modal_intake_patch[\s\S]*?\bthen\b(?:(?!end if;)[\s\S])*?if p_card_action/i;
    assertEquals(
      buggyPattern.test(sql),
      false,
      'p_card_action must not appear inside an open `if p_task_modal_intake_patch ... then` block',
    );

    // Every optional payload must appear as its own top-level `if ... then ... end if;` block.
    for (const param of [
      'p_execution_patch',
      'p_personal_cues',
      'p_task_modal_intake_patch',
      'p_card_action',
    ]) {
      const pattern = new RegExp(`if\\s+${param}\\s+is\\s+not\\s+null[\\s\\S]*?end if;`, 'i');
      assert(pattern.test(sql), `missing standalone if/end-if block for ${param}`);
    }
  },
);

Deno.test(
  'fix migration: agent_create_card_and_reply contains card_action sibling merge',
  async () => {
    const sql = await readFixMigration();
    const createFn = sql.slice(
      sql.indexOf('create or replace function public.agent_create_card_and_reply'),
      sql.indexOf('create or replace function public.agent_insert_coach_workout_draft_reply'),
    );
    assert(createFn.length > 0, 'expected agent_create_card_and_reply body to be present');
    assert(
      /jsonb_build_object\('card_action', p_card_action\)/.test(createFn),
      'expected card_action merge in agent_create_card_and_reply',
    );
  },
);

Deno.test(
  'fix migration: agent_insert_coach_workout_draft_reply builds reply meta via v_reply_meta variable',
  async () => {
    const sql = await readFixMigration();
    const draftFn = sql.slice(
      sql.indexOf('create or replace function public.agent_insert_coach_workout_draft_reply'),
    );
    // The fixed function builds metadata in a local variable with sibling
    // `if ... then` blocks rather than the buggy nested `case ... end` chain.
    assert(/v_reply_meta\s+jsonb;/.test(draftFn), 'expected v_reply_meta declaration');
    assert(
      /jsonb_build_object\('card_action', p_card_action\)/.test(draftFn),
      'expected card_action merge in agent_insert_coach_workout_draft_reply',
    );
  },
);

// ---------------------------------------------------------------------------
// Section 2 — Persistence simulator round-trips.
// ---------------------------------------------------------------------------

Deno.test('simulator: card_action alone persists onto agent_create_card_and_reply metadata', () => {
  const meta = simulateCreateCardReplyMetadata({ card_action: TRIGGER_GENERATION });
  assertEquals(meta.card_action, TRIGGER_GENERATION);
  assertEquals('task_modal_intake_patch' in meta, false);
  assertEquals('execution_patch' in meta, false);
  assertEquals('personal_cues_patch' in meta, false);
});

Deno.test(
  'simulator: card_action + intake_patch both persist on agent_create_card_and_reply',
  () => {
    const meta = simulateCreateCardReplyMetadata({
      card_action: TRIGGER_GENERATION,
      task_modal_intake_patch: { readiness: 7 },
    });
    assertEquals(meta.card_action, TRIGGER_GENERATION);
    assertEquals(meta.task_modal_intake_patch, { readiness: 7 });
  },
);

Deno.test('simulator: empty card_action and empty intake are both dropped', () => {
  const meta = simulateCreateCardReplyMetadata({
    card_action: {},
    task_modal_intake_patch: {},
  });
  assertEquals('card_action' in meta, false);
  assertEquals('task_modal_intake_patch' in meta, false);
});

Deno.test('simulator: empty execution_patch / personal_cues arrays are dropped', () => {
  const meta = simulateCreateCardReplyMetadata({
    execution_patch: [],
    personal_cues: [],
  });
  assertEquals('execution_patch' in meta, false);
  assertEquals('personal_cues_patch' in meta, false);
});

Deno.test(
  'simulator: all four optional payloads merge as siblings on agent_create_card_and_reply',
  () => {
    const meta = simulateCreateCardReplyMetadata({
      execution_patch: [{ exerciseIndex: 0, status: 'done' }],
      personal_cues: [{ exercise_dictionary_id: 'uuid', mode: 'append', form_cues: 'knees out' }],
      task_modal_intake_patch: { readiness: 6 },
      card_action: TRIGGER_GENERATION,
    });
    assertExists(meta.execution_patch);
    assertExists(meta.personal_cues_patch);
    assertEquals(meta.task_modal_intake_patch, { readiness: 6 });
    assertEquals(meta.card_action, TRIGGER_GENERATION);
  },
);

Deno.test('simulator: draft-reply preserves coach_draft + card_action + intake siblings', () => {
  const meta = simulateCoachDraftReplyMetadata({
    target_task_id: '00000000-0000-4000-8000-000000000666',
    proposed_title: '  Strength A  ',
    proposed_description: '',
    proposed_metadata: { workout_type: 'AMRAP' },
    task_modal_intake_patch: { readiness: 4 },
    card_action: TRIGGER_GENERATION,
  });
  assertExists(meta.coach_draft);
  const draft = meta.coach_draft as Record<string, unknown>;
  assertEquals(draft.status, 'pending');
  assertEquals(draft.proposed_title, 'Strength A');
  assertEquals(draft.proposed_description, null);
  assertEquals(draft.proposed_metadata, { workout_type: 'AMRAP' });
  assertEquals(draft.target_task_id, '00000000-0000-4000-8000-000000000666');
  assertEquals(meta.task_modal_intake_patch, { readiness: 4 });
  assertEquals(meta.card_action, TRIGGER_GENERATION);
});

Deno.test('simulator: update_task_and_reply persists card_action on reply metadata', () => {
  const meta = simulateUpdateTaskReplyMetadata({ card_action: TRIGGER_GENERATION });
  assertEquals(meta.card_action, TRIGGER_GENERATION);
});
