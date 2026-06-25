/** MIRROR FILE — canonical lives at `src/lib/agents/coach/block-exercise-fill-schema.ts`.
 *
 * Body below is byte-for-byte identical to the canonical Vitest-side file (excluding
 * this header). Import paths use explicit `.ts` extensions required by Deno.
 * Any change must be hand-mirrored — run `pnpm check:agent-mirror` to verify parity.
 */

import type { VertexResponseSchema } from '../../_shared/llm/types.ts';

export const COACH_BLOCK_EXERCISE_FILL_SCHEMA: VertexResponseSchema = {
  type: 'OBJECT',
  properties: {
    blocks: {
      type: 'ARRAY',
      description:
        'One entry per fixed block shell from the user message. name must match the shell exactly.',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          exercises: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                sets: { type: 'INTEGER', nullable: true },
                reps: { type: 'STRING', nullable: true },
              },
              required: ['name'],
            },
          },
        },
        required: ['name', 'exercises'],
      },
    },
  },
  required: ['blocks'],
};

export type BlockExerciseFillResponse = {
  blocks: Array<{
    name: string;
    exercises: Array<{ name: string; sets?: number; reps?: string }>;
  }>;
};
