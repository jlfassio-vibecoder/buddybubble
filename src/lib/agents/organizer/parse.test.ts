/**
 * Canonical Vitest coverage for Organizer's pure parser + write-gate.
 *
 * Mirrors the assertions in `src/lib/agents/organizerResponse.test.ts`, which now
 * exercises the same logic via the re-export shim at
 * `src/lib/agents/organizerResponse.ts`. Both test files should pass — the older one
 * proves the shim is wired correctly; this one is the canonical home for new cases
 * added to the Organizer parser going forward.
 */

import { describe, expect, it } from 'vitest';

import {
  gateOrganizerWrite,
  mentionsHandle,
  parseOrganizerResponse,
  type OrganizerParsedResponse,
} from './parse';
import { organizerSystemPrompt } from './prompts';

describe('organizer system prompt (scope invariants)', () => {
  it('instructs Organizer on scheduling / agendas / follow-ups', () => {
    expect(organizerSystemPrompt).toMatch(/scheduling meetings/i);
    expect(organizerSystemPrompt).toMatch(/agenda/i);
    expect(organizerSystemPrompt).toMatch(/follow-ups/i);
  });

  it('redirects fitness asks to @Coach and forbids workout output', () => {
    expect(organizerSystemPrompt).toMatch(/@Coach/);
    expect(organizerSystemPrompt).toMatch(/NOT a fitness coach/i);
    expect(organizerSystemPrompt).not.toMatch(/prescribe.*workout/i);
    expect(organizerSystemPrompt).toMatch(/Do NOT produce a workout/i);
  });

  it('requires human-in-the-loop for writes', () => {
    expect(organizerSystemPrompt).toMatch(/ORGANIZER_WRITES_ENABLED/);
    expect(organizerSystemPrompt).toMatch(/do NOT silently mutate/);
  });
});

describe('mentionsHandle (Organizer dispatcher)', () => {
  it('matches a bare @Organizer mention case-insensitively', () => {
    expect(mentionsHandle('@Organizer when can we meet?', 'Organizer')).toBe(true);
    expect(mentionsHandle('@organizer when can we meet?', 'Organizer')).toBe(true);
    expect(mentionsHandle('@ORGANIZER schedule standup', 'Organizer')).toBe(true);
  });

  it('does not false-positive on email-shaped content', () => {
    expect(mentionsHandle('email me at foo@organizer.com', 'Organizer')).toBe(false);
  });

  it('respects word boundaries', () => {
    expect(mentionsHandle('@Organizer.', 'Organizer')).toBe(true);
    expect(mentionsHandle('@OrganizerBot schedule', 'Organizer')).toBe(false);
  });
});

describe('parseOrganizerResponse', () => {
  it('parses a plain reply without proposedWrite', () => {
    const raw = JSON.stringify({ replyContent: 'Got it — how about Tue at 2pm?' });
    expect(parseOrganizerResponse(raw)).toEqual({
      replyContent: 'Got it — how about Tue at 2pm?',
      proposedWrite: null,
    });
  });

  it('parses a create_task proposedWrite with all fields', () => {
    const raw = JSON.stringify({
      replyContent: 'Want me to add this follow-up?',
      proposedWrite: {
        kind: 'create_task',
        rationale: 'user asked for a standup task',
        payload: {
          title: 'Schedule weekly standup',
          description: 'Sync with design + eng',
          due_on: '2026-04-25',
          assignee_user_id: '11111111-1111-1111-8111-111111111111',
        },
      },
    });
    const parsed = parseOrganizerResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.proposedWrite).toEqual({
      kind: 'create_task',
      rationale: 'user asked for a standup task',
      payload: {
        title: 'Schedule weekly standup',
        description: 'Sync with design + eng',
        due_on: '2026-04-25',
        assignee_user_id: '11111111-1111-1111-8111-111111111111',
      },
    });
  });

  it('drops a malformed ISO due_on to null', () => {
    const raw = JSON.stringify({
      replyContent: 'proposed task with a bad date',
      proposedWrite: {
        kind: 'create_task',
        rationale: 'deadline',
        payload: { title: 'Pick a date', due_on: 'next Friday' },
      },
    });
    const parsed = parseOrganizerResponse(raw);
    if (parsed?.proposedWrite?.kind === 'create_task') {
      expect(parsed.proposedWrite.payload.due_on).toBeNull();
    } else {
      throw new Error('expected create_task');
    }
  });

  it('drops a non-UUID assignee to null', () => {
    const raw = JSON.stringify({
      replyContent: 'proposed task',
      proposedWrite: {
        kind: 'create_task',
        rationale: 'owner',
        payload: { title: 'Own this', assignee_user_id: 'justin' },
      },
    });
    const parsed = parseOrganizerResponse(raw);
    if (parsed?.proposedWrite?.kind === 'create_task') {
      expect(parsed.proposedWrite.payload.assignee_user_id).toBeNull();
    } else {
      throw new Error('expected create_task');
    }
  });

  it('parses an append_agenda_note proposedWrite', () => {
    const raw = JSON.stringify({
      replyContent: 'Adding to the agenda.',
      proposedWrite: {
        kind: 'append_agenda_note',
        rationale: 'user asked',
        payload: { note: 'Review Q2 goals' },
      },
    });
    expect(parseOrganizerResponse(raw)?.proposedWrite).toEqual({
      kind: 'append_agenda_note',
      rationale: 'user asked',
      payload: { note: 'Review Q2 goals' },
    });
  });

  it('returns null on empty replyContent', () => {
    expect(parseOrganizerResponse(JSON.stringify({ replyContent: '' }))).toBeNull();
    expect(parseOrganizerResponse(JSON.stringify({ replyContent: '   ' }))).toBeNull();
  });

  it('tolerates ```json ... ``` fences from the model', () => {
    const raw = '```json\n{"replyContent":"ok"}\n```';
    expect(parseOrganizerResponse(raw)).toEqual({ replyContent: 'ok', proposedWrite: null });
  });

  it('strips a leading ```json fence when there is no closing fence (partial fence path)', () => {
    const raw = '```json\n{"replyContent":"ok no closing fence"}';
    expect(parseOrganizerResponse(raw)).toEqual({
      replyContent: 'ok no closing fence',
      proposedWrite: null,
    });
  });

  it('returns null when JSON is invalid after stripping', () => {
    expect(parseOrganizerResponse('```json\nnot-json\n```')).toBeNull();
  });

  it('ignores a proposedWrite with unknown kind', () => {
    const raw = JSON.stringify({
      replyContent: 'nope',
      proposedWrite: {
        kind: 'delete_all_tasks',
        rationale: 'evil',
        payload: {},
      },
    });
    expect(parseOrganizerResponse(raw)?.proposedWrite).toBeNull();
  });

  it('truncates create_task title to 120 chars', () => {
    const longTitle = 'x'.repeat(200);
    const raw = JSON.stringify({
      replyContent: 'noted',
      proposedWrite: {
        kind: 'create_task',
        rationale: 'long title test',
        payload: { title: longTitle },
      },
    });
    const parsed = parseOrganizerResponse(raw);
    if (parsed?.proposedWrite?.kind === 'create_task') {
      expect(parsed.proposedWrite.payload.title.length).toBe(120);
    } else {
      throw new Error('expected create_task');
    }
  });
});

describe('gateOrganizerWrite (Phase 4 write-gating)', () => {
  const baseReply: OrganizerParsedResponse = {
    replyContent: 'scheduling your standup',
    proposedWrite: {
      kind: 'create_task',
      rationale: 'standup',
      payload: {
        title: 'Weekly standup',
        description: 'Tuesdays at 10',
        due_on: '2026-04-28',
        assignee_user_id: null,
      },
    },
  };

  it('blocks writes when ORGANIZER_WRITES_ENABLED is false', () => {
    expect(gateOrganizerWrite(baseReply, false)).toEqual({
      p_task_title: null,
      p_task_description: null,
      p_task_due_on: null,
      p_task_assignee_user_id: null,
    });
  });

  it('passes through task fields when writes enabled and proposedWrite is create_task', () => {
    expect(gateOrganizerWrite(baseReply, true)).toEqual({
      p_task_title: 'Weekly standup',
      p_task_description: 'Tuesdays at 10',
      p_task_due_on: '2026-04-28',
      p_task_assignee_user_id: null,
    });
  });

  it('does not create a task for append_agenda_note even with writes enabled', () => {
    const parsed: OrganizerParsedResponse = {
      replyContent: 'added',
      proposedWrite: {
        kind: 'append_agenda_note',
        rationale: 'x',
        payload: { note: 'discuss launch' },
      },
    };
    expect(gateOrganizerWrite(parsed, true).p_task_title).toBeNull();
  });

  it('returns null task params when there is no proposedWrite', () => {
    const parsed: OrganizerParsedResponse = {
      replyContent: 'ok',
      proposedWrite: null,
    };
    expect(gateOrganizerWrite(parsed, true).p_task_title).toBeNull();
  });
});
