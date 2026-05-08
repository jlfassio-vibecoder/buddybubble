/**
 * MIRROR FILE — canonical lives at `src/lib/agents/buddy/schema.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Any change must be hand-mirrored — run `pnpm check:agent-mirror` to
 * verify parity.
 *
 * No relative imports → import paths are identical between Node and Deno builds for
 * this module.
 */

export const BUDDY_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    replyContent: {
      type: 'STRING',
      description:
        "What Buddy says in chat. Required. Plain text, 1–3 short sentences by default. Never echo the '[SYSTEM_EVENT: ONBOARDING_STARTED]' sentinel.",
    },
    createCard: {
      type: 'OBJECT',
      nullable: true,
      description:
        'Optional Kanban card Buddy proposes. Include only when a Bubbleboard card would genuinely help the user act on replyContent. Use null / omit otherwise.',
      properties: {
        title: {
          type: 'STRING',
          description:
            'Short plain-text card title, <= 100 chars. NO EMOJIS. State the action once and stop.',
        },
        description: {
          type: 'STRING',
          description: 'Card body: small checklist or 1–4 concrete steps the user can act on.',
        },
        action_type: {
          type: 'STRING',
          description:
            'Short snake_case tag describing the card purpose (e.g. onboarding_checklist, try_first_card, invite_teammate, create_first_bubble, explore_bubbleboard).',
        },
      },
      required: ['title', 'description', 'action_type'],
    },
  },
  required: ['replyContent'],
} as const;
