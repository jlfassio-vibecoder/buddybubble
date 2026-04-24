/**
 * V1.5: Gemini text step — turns card title/description into a short visual-only brief for Imagen.
 * Uses Vertex AI `generateContent` (same OAuth as Imagen).
 *
 * Env (server):
 * - VERTEX_SCENE_BRIEF_MODEL — default `gemini-2.5-flash`
 * - VERTEX_GEMINI_LOCATION — defaults to VERTEX_IMAGE_LOCATION or `us-central1` (must be regional, not `global`)
 */

import { itemTypeLabelForPrompt } from '@/lib/ai/card-cover-presets';
import { normalizeItemType } from '@/lib/item-types';

const MAX_ERROR_LOG_LENGTH = 500;
const MAX_INPUT_TITLE = 220;
const MAX_INPUT_DESCRIPTION = 800;
const MAX_WORDS = 50;

const SCENE_BRIEF_SYSTEM_PROMPT =
  'You are an expert prompt engineer for an image generation model. Your job is to take the title and description of a community planning card and translate it into a purely visual scene description. Maximum 50 words. Do not include abstract concepts, UI elements, or text overlays. Focus entirely on subjects, lighting, atmosphere, and physical setting. Respond ONLY with the visual description.';

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const v = process.env[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function resolveVertexGeminiLocation(): string {
  return (
    readEnv('VERTEX_GEMINI_LOCATION') ||
    readEnv('VERTEX_IMAGE_LOCATION') ||
    readEnv('GOOGLE_CLOUD_IMAGE_REGION') ||
    'us-central1'
  );
}

export function resolveSceneBriefGeminiModelId(): string {
  return readEnv('VERTEX_SCENE_BRIEF_MODEL') || 'gemini-2.5-flash';
}

function enforceMaxWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ');
}

function stripFence(s: string): string {
  let t = s.trim();
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '');
  }
  return t.trim();
}

export type GenerateSceneBriefInput = {
  title: string;
  description?: string;
  /** Raw `item_type` (normalized internally for the user prompt line). */
  itemType: string;
  /** Comma-separated movement names (and optional equipment) for workout cards. */
  exercises?: string;
};

/**
 * Calls Vertex Gemini to produce a ≤50-word visual scene description for the Imagen pipeline.
 */
export async function generateSceneBrief(
  input: GenerateSceneBriefInput,
  vertex: { projectId: string; accessToken: string },
  options?: { logPrefix?: string; timeoutMs?: number },
): Promise<string> {
  const logPrefix = options?.logPrefix ?? '[scene-brief]';
  const timeoutMs = options?.timeoutMs ?? 60_000;

  const itemKind = normalizeItemType(input.itemType);
  const typeLine = itemTypeLabelForPrompt(itemKind);
  const title = input.title.trim().slice(0, MAX_INPUT_TITLE);
  const descRaw = (input.description ?? '').trim();
  const description = descRaw ? descRaw.slice(0, MAX_INPUT_DESCRIPTION) : '';

  const isWorkoutish = itemKind === 'workout' || itemKind === 'workout_log';
  const exercisesBlock = isWorkoutish
    ? `\nExercises/Equipment: ${input.exercises?.trim() || 'None specified'}.`
    : '';
  const userPrompt = `Card Type: ${typeLine}\nTitle: ${title || '(untitled)'}\nDescription: ${description || 'None'}.${exercisesBlock}`;

  const location = resolveVertexGeminiLocation();
  const modelId = resolveSceneBriefGeminiModelId();
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${vertex.projectId}/locations/${location}/publishers/google/models/${modelId}:generateContent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vertex.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SCENE_BRIEF_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 256,
          topP: 0.95,
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `${logPrefix} Gemini ${response.status}: ${errText.slice(0, MAX_ERROR_LOG_LENGTH)}`,
    );
  }

  const rawBody = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`${logPrefix} Non-JSON from Gemini`);
  }

  const parts = (
    data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
  ).candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text ?? '').join('') ?? '';

  const cleaned = stripFence(text);
  if (!cleaned) {
    throw new Error(`${logPrefix} Empty scene brief from model`);
  }

  return enforceMaxWords(cleaned, MAX_WORDS);
}
