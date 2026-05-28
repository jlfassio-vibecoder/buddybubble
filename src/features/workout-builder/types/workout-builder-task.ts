import type { Json, MemberRole } from '@/types/database';

/** Serializable task payload from the builder route Server Component to the client shell. */
export type WorkoutBuilderTaskPayload = {
  id: string;
  title: string | null;
  description: string | null;
  bubble_id: string;
  metadata: Json | null;
  item_type: string | null;
  memberRole: MemberRole;
};
