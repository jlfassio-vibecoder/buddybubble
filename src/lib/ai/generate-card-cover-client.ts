import type { Json } from '@/types/database';

export type GenerateCardCoverResponse = {
  card_cover_path: string;
  metadata: Json;
};

export async function postGenerateCardCover(body: {
  workspace_id: string;
  task_id: string;
  hint?: string;
  preset_id?: string;
}): Promise<GenerateCardCoverResponse> {
  const res = await fetch('/api/ai/generate-card-cover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    card_cover_path?: string;
    metadata?: Json;
  };
  if (!res.ok) {
    const msg = data.error || res.statusText || 'Could not generate cover';
    const err = new Error(msg) as Error & { code?: string; status?: number };
    err.code = data.code;
    err.status = res.status;
    throw err;
  }
  if (!data.card_cover_path || data.metadata == null) {
    throw new Error('Invalid response from generate-card-cover');
  }
  return { card_cover_path: data.card_cover_path, metadata: data.metadata };
}
