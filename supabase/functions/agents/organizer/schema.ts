/**
 * MIRROR FILE — canonical lives at `src/lib/agents/organizer/schema.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored. Phase 7 will add a drift-detection
 * lint to enforce parity.
 *
 * No relative imports → import paths are identical between Node and Deno builds for
 * this module.
 */

export const ORGANIZER_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    replyContent: {
      type: 'STRING',
      description:
        'What Organizer says in chat. Required. Plain text, 1–3 short sentences by default. Never echo any SYSTEM_EVENT sentinel.',
    },
    proposedWrite: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Optional structured write Organizer proposes. The server DOES NOT execute it unless ORGANIZER_WRITES_ENABLED=1 and the payload validates. Use null / omit when only replying.',
      properties: {
        kind: {
          type: 'STRING',
          enum: ['create_task', 'append_agenda_note'],
          description: 'Discriminator. Controls the payload shape.',
        },
        rationale: {
          type: 'STRING',
          description: 'Short human-readable reason for the proposed write.',
        },
        payload: {
          type: 'OBJECT',
          description:
            'Payload shape depends on kind. create_task: {title, description?, due_on?, assignee_user_id?}. append_agenda_note: {note}.',
          properties: {
            title: { type: 'STRING', nullable: true },
            description: { type: 'STRING', nullable: true },
            due_on: { type: 'STRING', nullable: true },
            assignee_user_id: { type: 'STRING', nullable: true },
            note: { type: 'STRING', nullable: true },
          },
        },
      },
      required: ['kind', 'rationale', 'payload'],
    },
  },
  required: ['replyContent'],
} as const;
