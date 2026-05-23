/**
 * Vertex Gemini generateContent for Coach Phase B outline (Next.js server only).
 */

import {
  COACH_MODEL_DEFAULT,
  COACH_OUTLINE_ONLY_MAX_OUTPUT_TOKENS,
  COACH_OUTLINE_ONLY_TEMPERATURE,
  COACH_OUTLINE_ONLY_THINKING_BUDGET,
} from '@/lib/agents/coach/config';
import {
  buildCoachOutlinePhaseBPrompts,
  processCoachOutlinePhaseBVertexOutput,
  type CoachOutlinePhaseBResult,
} from '@/lib/agents/coach/run-coach-outline-phase-b';
import { COACH_OUTLINE_ONLY_SCHEMA } from '@/lib/agents/coach/schema';
import { resolveVertexGeminiLocation } from '@/lib/ai/scene-brief-generator';

const MAX_ERROR_LOG_LENGTH = 500;

function extractGeminiText(
  candidate:
    | {
        content?: { parts?: Array<{ text?: string }> };
      }
    | null
    | undefined,
): string | null {
  const parts = candidate?.content?.parts;
  if (!parts?.length) return null;
  const text = parts.map((p) => p.text ?? '').join('');
  return text.trim() ? text : null;
}

export async function runCoachOutlinePhaseBVertex(args: {
  title: string;
  description: string;
  userMessage?: string;
  projectId: string;
  accessToken: string;
  timeoutMs?: number;
  logPrefix?: string;
}): Promise<CoachOutlinePhaseBResult> {
  const logPrefix = args.logPrefix ?? '[coach-outline-phase-b]';
  const timeoutMs = args.timeoutMs ?? 120_000;
  const location = resolveVertexGeminiLocation();
  const modelId = COACH_MODEL_DEFAULT;
  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${args.projectId}/locations/${location}/publishers/google/models/${modelId}:generateContent`;

  const { systemPrompt, userPrompt } = buildCoachOutlinePhaseBPrompts({
    title: args.title,
    description: args.description,
    userMessage: args.userMessage,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: COACH_OUTLINE_ONLY_TEMPERATURE,
          maxOutputTokens: COACH_OUTLINE_ONLY_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: COACH_OUTLINE_ONLY_SCHEMA,
          thinkingConfig: { thinkingBudget: COACH_OUTLINE_ONLY_THINKING_BUDGET },
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const msg = err instanceof Error ? err.message : 'Outline generation failed';
    return processCoachOutlinePhaseBVertexOutput({ text: null, generateError: msg });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errText = await response.text();
    return processCoachOutlinePhaseBVertexOutput({
      text: null,
      generateError: `${logPrefix} Gemini ${response.status}: ${errText.slice(0, MAX_ERROR_LOG_LENGTH)}`,
    });
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return processCoachOutlinePhaseBVertexOutput({
      text: null,
      generateError: 'Non-JSON response from outline model',
    });
  }

  const candidate = (
    data as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
    }
  ).candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  const text = extractGeminiText(candidate);

  return processCoachOutlinePhaseBVertexOutput({ text, finishReason });
}
