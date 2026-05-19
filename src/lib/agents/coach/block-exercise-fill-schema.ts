/**
 * Minimal Vertex JSON schema for Lane 2 block exercise-fill micro-call.
 * Mirror: `supabase/functions/agents/coach/block-exercise-fill-schema.ts`.
 */

import type { VertexResponseSchema } from '../_shared/llm/types';

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
