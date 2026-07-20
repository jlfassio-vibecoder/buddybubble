import type { Json } from '@/types/database';
import type { ProposedWorkoutMetadataView } from '@/lib/agents/coach/proposed-workout-metadata-view';
import { coerceProposedWorkoutMetadataView } from '@/lib/agents/coach/proposed-workout-metadata-view';

/** Stored under `messages.metadata.coach_draft` for coach workout proposals. */
export type CoachDraftPayload = {
  status: 'pending' | 'accepted' | 'superseded';
  proposed_title: string | null;
  proposed_description: string | null;
  proposed_metadata: ProposedWorkoutMetadataView;
  target_task_id: string;
  accepted_at?: string;
  accepted_by?: string;
};

export function parseCoachDraftFromMessageMetadata(metadata: unknown): CoachDraftPayload | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const o = metadata as Record<string, unknown>;
  const draft = o.coach_draft;
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  const d = draft as Record<string, unknown>;
  const status = d.status;
  if (status !== 'pending' && status !== 'accepted' && status !== 'superseded') return null;
  const target = typeof d.target_task_id === 'string' ? d.target_task_id.trim() : '';
  if (!target) return null;
  const proposed_metadata = coerceProposedWorkoutMetadataView(d.proposed_metadata) ?? {};
  return {
    status,
    proposed_title: typeof d.proposed_title === 'string' ? d.proposed_title : null,
    proposed_description:
      typeof d.proposed_description === 'string' ? d.proposed_description : null,
    proposed_metadata,
    target_task_id: target,
    accepted_at: typeof d.accepted_at === 'string' ? d.accepted_at : undefined,
    accepted_by: typeof d.accepted_by === 'string' ? d.accepted_by : undefined,
  };
}

/** Safe JSON for Supabase `messages.metadata` column. */
export function coachDraftMetadataToJson(draft: CoachDraftPayload): Json {
  return JSON.parse(JSON.stringify({ coach_draft: draft })) as Json;
}
