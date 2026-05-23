import type { Json } from '@/types/database';

export type GenerateWorkoutOutlineResponse = {
  metadata: Json;
};

export async function postGenerateWorkoutOutline(body: {
  workspace_id: string;
  task_id: string;
  user_message?: string;
}): Promise<GenerateWorkoutOutlineResponse> {
  const res = await fetch('/api/ai/generate-workout-outline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    code?: string;
    metadata?: Json;
  };
  if (!res.ok) {
    const msg = data.message || data.error || res.statusText || 'Could not generate outline';
    const err = new Error(msg) as Error & { code?: string; status?: number; metadata?: Json };
    err.code = data.code;
    err.status = res.status;
    if (data.metadata != null) err.metadata = data.metadata;
    throw err;
  }
  if (data.metadata == null) {
    throw new Error('Invalid response from generate-workout-outline');
  }
  return { metadata: data.metadata };
}
