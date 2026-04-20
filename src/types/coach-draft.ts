import type { Json } from '@/types/database';

/** Stored under `messages.metadata.coach_draft` for coach workout proposals. */
export type CoachDraftPayload = {
  status: 'pending' | 'accepted' | 'superseded';
  proposed_title: string | null;
  proposed_description: string | null;
  proposed_metadata: Record<string, unknown>;
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
  const pm = d.proposed_metadata;
  const proposed_metadata =
    pm && typeof pm === 'object' && !Array.isArray(pm) ? (pm as Record<string, unknown>) : {};
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
