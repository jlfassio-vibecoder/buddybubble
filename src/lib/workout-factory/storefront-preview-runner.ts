/**
 * Single-call Vertex preview for unauthenticated storefront (Day 1 style summary only).
 * No DB access. Bounded tokens and timeout for serverless.
 */

import { mapStorefrontProfileToFitnessProfileUpsert } from '@/lib/storefront-trial-fitness-profile';
import { parseJSONWithRepair } from '@/lib/workout-factory/json-parser';
import { callVertexAI, getVertexAICredentials } from '@/lib/workout-factory/vertex-ai-client';

const MAX_TITLE = 120;
const MAX_TAGLINE = 200;
const MAX_DAY_LABEL = 40;
const MAX_SUMMARY = 800;
const MAX_COACH_TIP = 400;
const MAX_EXERCISES = 8;
const MAX_EX_NAME = 80;
const MAX_EX_DETAIL = 240;

export type StorefrontPreviewExercise = {
  name: string;
  detail: string;
};

export type StorefrontPreviewPayload = {
  title: string;
  tagline?: string;
  day_label: string;
  estimated_minutes: number;
  summary: string;
  main_exercises: StorefrontPreviewExercise[];
  coach_tip: string;
};

function clampStr(s: unknown, maxLen: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.length > maxLen ? t.slice(0, maxLen) : t;
}

function clampNum(n: unknown, min: number, max: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Validates model JSON for safe, bounded storefront display.
 */
export function validateStorefrontPreviewPayload(
  raw: unknown,
): { ok: true; preview: StorefrontPreviewPayload } | { ok: false; error: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Preview must be a JSON object' };
  }
  const o = raw as Record<string, unknown>;

  const title = clampStr(o.title, MAX_TITLE);
  const day_label = clampStr(o.day_label, MAX_DAY_LABEL);
  const summary = clampStr(o.summary, MAX_SUMMARY);
  const coach_tip = clampStr(o.coach_tip, MAX_COACH_TIP);
  const est = clampNum(o.estimated_minutes, 10, 120);

  if (!title || !day_label || !summary || !coach_tip || est == null) {
    return { ok: false, error: 'Missing or invalid required preview fields' };
  }

  const taglineRaw = o.tagline;
  const tagline =
    typeof taglineRaw === 'string' && taglineRaw.trim()
      ? taglineRaw.trim().slice(0, MAX_TAGLINE)
      : undefined;

  const me = o.main_exercises;
  if (!Array.isArray(me) || me.length === 0 || me.length > MAX_EXERCISES) {
    return { ok: false, error: 'main_exercises must be a non-empty array (max 8)' };
  }

  const main_exercises: StorefrontPreviewExercise[] = [];
  for (const item of me) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { ok: false, error: 'Invalid exercise entry' };
    }
    const ex = item as Record<string, unknown>;
    const name = clampStr(ex.name, MAX_EX_NAME);
    const detail = clampStr(ex.detail, MAX_EX_DETAIL);
    if (!name || !detail) {
      return { ok: false, error: 'Each exercise needs name and detail' };
    }
    main_exercises.push({ name, detail });
  }

  return {
    ok: true,
    preview: {
      title,
      tagline,
      day_label,
      estimated_minutes: est,
      summary,
      main_exercises,
      coach_tip,
    },
  };
}

function buildProfileContextBlock(profile: unknown): string {
  const mapped = mapStorefrontProfileToFitnessProfileUpsert(profile);
  if (mapped) {
    const parts = [
      `Goals: ${mapped.goals.join(', ') || '(not specified)'}`,
      `Equipment: ${mapped.equipment.join(', ') || '(not specified)'}`,
      `Units: ${mapped.unit_system}`,
      `Biometrics / notes: ${JSON.stringify(mapped.biometrics)}`,
    ];
    return parts.join('\n');
  }
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    return `Raw profile JSON (use for context only):\n${JSON.stringify(profile).slice(0, 4000)}`;
  }
  return 'No structured profile provided.';
}

const SYSTEM_PROMPT = `You are a certified strength coach. Output ONLY valid JSON (no markdown, no code fences) matching this exact shape:
{
  "title": string (workout title, max 120 chars),
  "tagline": string optional (short hook, max 200 chars),
  "day_label": string (e.g. "Day 1" or "Session 1", max 40 chars),
  "estimated_minutes": number (integer 10-120, realistic for one session),
  "summary": string (2-4 sentences describing the session focus and flow, max 800 chars),
  "main_exercises": array of 3 to 8 objects, each { "name": string (max 80 chars), "detail": string (sets/reps or work/rest guidance, max 240 chars) },
  "coach_tip": string (one practical tip for this athlete, max 400 chars)
}
Rules:
- Single-session preview only (like "Day 1"). Do not describe multi-week programs.
- Exercises must match the stated equipment and experience level.
- Be conservative with volume for beginners.
- All strings in plain text, no HTML.`;

/**
 * Runs one Vertex call and returns validated preview JSON.
 */
export async function runStorefrontPreviewGeneration(
  profile: unknown,
): Promise<{ ok: true; preview: StorefrontPreviewPayload } | { ok: false; response: Response }> {
  const creds = await getVertexAICredentials('[storefront-preview]');
  if ('error' in creds) {
    return { ok: false, response: creds.error };
  }
  const { projectId, region, accessToken } = creds;

  const userPrompt = `Athlete / visitor profile:\n${buildProfileContextBlock(profile)}\n\nGenerate ONE session preview JSON as specified.`;

  let text: string;
  try {
    text = await callVertexAI({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      accessToken,
      projectId,
      region,
      temperature: 0.35,
      maxTokens: 1400,
      timeoutMs: 14_000,
      logPrefix: '[storefront-preview]',
    });
  } catch (e) {
    console.error('[storefront-preview] Vertex call failed', e);
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'Preview generation failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  const parsed = parseJSONWithRepair(text);
  const validated = validateStorefrontPreviewPayload(parsed.data);
  if (!validated.ok) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: validated.error || 'Invalid preview shape' }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    };
  }

  return { ok: true, preview: validated.preview };
}
