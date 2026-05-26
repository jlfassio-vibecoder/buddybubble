import type { Json } from '@/types/database';

/** Serializable task payload passed from the session route Server Component to the client shell. */
export type ActiveSessionTaskPayload = {
  id: string;
  title: string | null;
  /** Source workout task bubble (provenance). */
  bubble_id: string;
  /** Bubble for workout_log drafts/completions (Workout Logs channel or fallback). */
  target_bubble_id: string;
  metadata: Json | null;
  item_type: string | null;
};
