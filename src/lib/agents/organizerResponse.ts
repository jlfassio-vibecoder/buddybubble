/**
 * Pure helpers for Organizer's dispatch pipeline.
 *
 * Canonical source of truth for:
 *   - `mentionsHandle` — word-bounded, case-insensitive @handle match.
 *   - `parseOrganizerResponse` — turns Gemini's JSON text into a typed Organizer reply.
 *   - `gateOrganizerWrite` — feature-flag + payload-kind gate; decides whether an incoming
 *     `proposedWrite` is passed through to the `organizer_create_reply_and_task` RPC.
 *
 * The Deno edge function at `supabase/functions/organizer-agent-dispatch/index.ts` mirrors
 * these helpers verbatim (Supabase Functions cannot import from outside their directory at
 * deploy time). Any change here MUST be mirrored there — `scripts/check-agent-coupling.ts`
 * does not yet enforce that drift check; it is called out in `docs/refactor/phase4-deviation-log.md`.
 */

export function escapeRegExpLiteral(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function mentionsHandle(content: string | null | undefined, handle: string): boolean {
  if (!content || !handle) return false;
  const re = new RegExp(`(^|[^\\w])@${escapeRegExpLiteral(handle)}(?!\\w)`, 'i');
  return re.test(content);
}

export type OrganizerProposedWrite =
  | {
      kind: 'create_task';
      rationale: string;
      payload: {
        title: string;
        description: string | null;
        due_on: string | null;
        assignee_user_id: string | null;
      };
    }
  | {
      kind: 'append_agenda_note';
      rationale: string;
      payload: { note: string };
    };

export type OrganizerParsedResponse = {
  replyContent: string;
  proposedWrite: OrganizerProposedWrite | null;
};

function stripJsonCodeFences(raw: string): string {
  let t = raw.trim();
  const fullFence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i;
  const m = t.match(fullFence);
  if (m) return m[1].trim();
  if (/^```(?:json)?\s*\r?\n?/i.test(t)) {
    t = t.replace(/^```(?:json)?\s*\r?\n?/i, '');
    t = t.replace(/\r?\n?```\s*$/, '');
  }
  return t.trim();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseOrganizerResponse(rawText: string): OrganizerParsedResponse | null {
  const cleaned = stripJsonCodeFences(rawText);
  if (!cleaned) return null;

  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const replyContentRaw = obj.replyContent;
  if (typeof replyContentRaw !== 'string') return null;
  const replyContent = replyContentRaw.trim();
  if (!replyContent) return null;

  let proposedWrite: OrganizerProposedWrite | null = null;
  const pwRaw = obj.proposedWrite;
  if (pwRaw && typeof pwRaw === 'object' && !Array.isArray(pwRaw)) {
    const pw = pwRaw as Record<string, unknown>;
    const kind = typeof pw.kind === 'string' ? pw.kind.trim() : '';
    const rationale =
      typeof pw.rationale === 'string' && pw.rationale.trim() ? pw.rationale.trim() : '';
    const payloadRaw = pw.payload;
    if (
      rationale &&
      payloadRaw &&
      typeof payloadRaw === 'object' &&
      !Array.isArray(payloadRaw)
    ) {
      const payload = payloadRaw as Record<string, unknown>;
      if (kind === 'create_task') {
        const title = typeof payload.title === 'string' ? payload.title.trim() : '';
        if (title) {
          const description =
            typeof payload.description === 'string' && payload.description.trim()
              ? payload.description.trim()
              : null;
          const due_on_raw = typeof payload.due_on === 'string' ? payload.due_on.trim() : '';
          const due_on = due_on_raw && ISO_DATE_RE.test(due_on_raw) ? due_on_raw : null;
          const assignee_raw =
            typeof payload.assignee_user_id === 'string' ? payload.assignee_user_id.trim() : '';
          const assignee_user_id =
            assignee_raw && UUID_RE.test(assignee_raw) ? assignee_raw : null;
          proposedWrite = {
            kind: 'create_task',
            rationale,
            payload: {
              title: title.slice(0, 120),
              description,
              due_on,
              assignee_user_id,
            },
          };
        }
      } else if (kind === 'append_agenda_note') {
        const note = typeof payload.note === 'string' ? payload.note.trim() : '';
        if (note) {
          proposedWrite = {
            kind: 'append_agenda_note',
            rationale,
            payload: { note },
          };
        }
      }
    }
  }

  return { replyContent, proposedWrite };
}

/**
 * Write-gating policy.
 *
 * Returns task fields to pass to `organizer_create_reply_and_task` iff writes are enabled AND
 * the proposedWrite is a well-formed `create_task`. Otherwise returns all-null task params so
 * the RPC inserts only the reply message. The Edge Function still returns `proposedWrite` in
 * the HTTP response so the UI can surface a confirmation affordance.
 */
export function gateOrganizerWrite(
  parsed: OrganizerParsedResponse,
  writesEnabled: boolean,
): {
  p_task_title: string | null;
  p_task_description: string | null;
  p_task_due_on: string | null;
  p_task_assignee_user_id: string | null;
} {
  if (!writesEnabled) {
    return {
      p_task_title: null,
      p_task_description: null,
      p_task_due_on: null,
      p_task_assignee_user_id: null,
    };
  }
  const pw = parsed.proposedWrite;
  if (!pw || pw.kind !== 'create_task') {
    return {
      p_task_title: null,
      p_task_description: null,
      p_task_due_on: null,
      p_task_assignee_user_id: null,
    };
  }
  return {
    p_task_title: pw.payload.title,
    p_task_description: pw.payload.description,
    p_task_due_on: pw.payload.due_on,
    p_task_assignee_user_id: pw.payload.assignee_user_id,
  };
}
