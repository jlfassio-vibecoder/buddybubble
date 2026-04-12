import type { ProgramWeek, WorkoutExercise } from '@/lib/item-metadata';
import { parseJSONWithRepair } from '@/lib/workout-factory/json-parser';
import { buildPersonalizeProgramPromptBundle } from '@/lib/workout-factory/personalize-program-prompt';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';
import type {
  PersonalizeProgramResult,
  PersonalizeProgramSession,
} from '@/lib/workout-factory/types/personalize-program';
import { callVertexAI, getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';
import { normalizeRepsForStorage } from '@/lib/workout-factory/parse-reps-scalar';

export type {
  PersonalizeProgramResult,
  PersonalizeProgramSession,
} from '@/lib/workout-factory/types/personalize-program';

function uniqueSessionKeys(schedule: ProgramWeek[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const w of schedule) {
    for (const d of w.days ?? []) {
      const k = d.name?.trim() ?? '';
      if (!k || seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  }
  return keys;
}

function asExerciseArray(raw: unknown): WorkoutExercise[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkoutExercise[] = [];
  for (const x of raw) {
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (!name) continue;
    const sets = typeof o.sets === 'number' ? o.sets : undefined;
    const repsNorm = normalizeRepsForStorage(o.reps);
    const coach_notes = typeof o.coach_notes === 'string' ? o.coach_notes : undefined;
    out.push({
      name,
      ...(sets != null ? { sets } : {}),
      ...(repsNorm !== undefined ? { reps: repsNorm } : {}),
      ...(coach_notes ? { coach_notes } : {}),
    });
  }
  return out;
}

function validateOutput(
  parsed: unknown,
  expectedKeys: string[],
): { ok: true; data: PersonalizeProgramResult } | { ok: false; error: string } {
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Expected JSON object' };
  }
  const o = parsed as Record<string, unknown>;
  const title_suffix = typeof o.title_suffix === 'string' ? o.title_suffix.trim() : '';
  const description = typeof o.description === 'string' ? o.description.trim() : '';
  if (!title_suffix) return { ok: false, error: 'Missing title_suffix' };
  if (!description) return { ok: false, error: 'Missing description' };
  if (!Array.isArray(o.sessions)) return { ok: false, error: 'sessions must be an array' };

  const sessions: PersonalizeProgramSession[] = [];
  const seen = new Set<string>();
  for (const s of o.sessions) {
    if (typeof s !== 'object' || s === null) continue;
    const row = s as Record<string, unknown>;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const desc = typeof row.description === 'string' ? row.description.trim() : '';
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sessions.push({
      key,
      title: title || key,
      description: desc,
      exercises: asExerciseArray(row.exercises),
    });
  }

  if (expectedKeys.length > 0) {
    for (const k of expectedKeys) {
      if (!seen.has(k)) {
        return { ok: false, error: `Missing session for key ${JSON.stringify(k)}` };
      }
    }
    for (const s of sessions) {
      if (!expectedKeys.includes(s.key)) {
        return { ok: false, error: `Unexpected session key ${JSON.stringify(s.key)}` };
      }
    }
  }

  return {
    ok: true,
    data: {
      title_suffix,
      description,
      sessions,
      model_used: 'deepseek-ai/deepseek-v3.2-maas',
    },
  };
}

export async function runPersonalizeProgram(params: {
  baseTitle: string;
  goal: string;
  durationWeeks: number;
  schedule: ProgramWeek[];
  persona: WorkoutPersona;
  equipmentNames: string[];
  shouldLog?: boolean;
}): Promise<{ ok: true; data: PersonalizeProgramResult } | { ok: false; response: Response }> {
  const shouldLog = params.shouldLog ?? false;
  const expectedKeys = uniqueSessionKeys(params.schedule);
  const { userPrompt } = buildPersonalizeProgramPromptBundle({
    persona: params.persona,
    equipmentNames: params.equipmentNames,
    baseTitle: params.baseTitle,
    goal: params.goal,
    durationWeeks: params.durationWeeks,
    schedule: params.schedule,
  });

  const creds = await getVertexAICredentials('[personalize-program]');
  if ('error' in creds) return { ok: false, response: creds.error };
  const { projectId, region, accessToken } = creds;

  if (shouldLog) console.warn('[personalize-program] calling Vertex…');

  const raw = await callVertexAI({
    systemPrompt:
      'You are an expert strength and conditioning coach. Output ONLY valid JSON matching the user schema. No markdown fences.',
    userPrompt,
    accessToken,
    projectId,
    region,
    temperature: 0.45,
    maxTokens: 8192,
    logPrefix: '[personalize-program]',
  });

  let parsed: ReturnType<typeof parseJSONWithRepair>;
  try {
    parsed = parseJSONWithRepair(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON from model';
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: msg }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }
  const validated = validateOutput(parsed.data, expectedKeys);
  if (!validated.ok) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: validated.error }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  return { ok: true, data: validated.data };
}
