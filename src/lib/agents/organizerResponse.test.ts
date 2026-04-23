import { describe, expect, it } from 'vitest';
import {
  gateOrganizerWrite,
  mentionsHandle,
  parseOrganizerResponse,
  type OrganizerParsedResponse,
} from '@/lib/agents/organizerResponse';
import { organizerSystemPromptMirror } from '@/lib/agents/organizerPromptFixture';

describe('organizer system prompt (scope invariants)', () => {
  it('instructs Organizer on scheduling / agendas / follow-ups', () => {
    expect(organizerSystemPromptMirror).toMatch(/scheduling meetings/i);
    expect(organizerSystemPromptMirror).toMatch(/agenda/i);
    expect(organizerSystemPromptMirror).toMatch(/follow-ups/i);
  });

  it('redirects fitness asks to @Coach and forbids workout output', () => {
    expect(organizerSystemPromptMirror).toMatch(/@Coach/);
    expect(organizerSystemPromptMirror).toMatch(/NOT a fitness coach/i);
    // Negative assertions: Organizer must never be told to prescribe workouts.
    expect(organizerSystemPromptMirror).not.toMatch(/prescribe.*workout/i);
    expect(organizerSystemPromptMirror).not.toMatch(/rep scheme/i);
  });

  it('requires human-in-the-loop for writes', () => {
    expect(organizerSystemPromptMirror).toMatch(/ORGANIZER_WRITES_ENABLED/);
    expect(organizerSystemPromptMirror).toMatch(/do NOT silently mutate/);
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

  it('schedule-a-standup round-trip: writes disabled → proposed_write returned, not executed', () => {
    // Simulates the Phase 4 default: flag OFF, Organizer proposes a task.
    const raw = JSON.stringify({
      replyContent: 'I can schedule a standup for tomorrow — want me to?',
      proposedWrite: {
        kind: 'create_task',
        rationale: 'scheduling request',
        payload: {
          title: 'Standup tomorrow 10am',
          description: null,
          due_on: '2026-04-24',
          assignee_user_id: null,
        },
      },
    });
    const parsed = parseOrganizerResponse(raw);
    expect(parsed?.proposedWrite?.kind).toBe('create_task');
    // Gate should return all nulls because writesEnabled=false (the RPC then only inserts the reply).
    expect(gateOrganizerWrite(parsed!, false)).toEqual({
      p_task_title: null,
      p_task_description: null,
      p_task_due_on: null,
      p_task_assignee_user_id: null,
    });
  });

  it('fitness-redirect path: a user asking Organizer for fitness should get no proposedWrite', () => {
    // Simulates the model obeying the prompt: short redirect reply, no write proposed.
    const raw = JSON.stringify({
      replyContent: "That's outside my scope — try @Coach in a fitness bubble.",
    });
    const parsed = parseOrganizerResponse(raw);
    expect(parsed?.proposedWrite).toBeNull();
    expect(gateOrganizerWrite(parsed!, true).p_task_title).toBeNull();
  });
});
