/**
 * Vertex Gemini generateContent for Coach Phase B outline (Next.js server only).
 */

import {
  COACH_OUTLINE_ONLY_MAX_OUTPUT_TOKENS,
  COACH_OUTLINE_ONLY_MODEL,
  COACH_OUTLINE_ONLY_TEMPERATURE,
} from '@/lib/agents/coach/config';
import {
  buildCoachOutlinePhaseBPrompts,
  processCoachOutlinePhaseBVertexOutput,
  type CoachOutlinePhaseBResult,
} from '@/lib/agents/coach/run-coach-outline-phase-b';
import type { VertexGenerateResponse } from '@/lib/agents/_shared/llm/types';
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
  const modelId = COACH_OUTLINE_ONLY_MODEL;
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

  const vertexData = data as VertexGenerateResponse;
  const candidate = vertexData.candidates?.[0];
  const finishReason = candidate?.finishReason ?? null;
  const text = extractGeminiText(candidate);
  const usage = vertexData.usageMetadata;

  console.warn(`${logPrefix} phase b vertex usage`, {
    finish_reason: finishReason,
    prompt_token_count: usage?.promptTokenCount ?? null,
    candidates_token_count: usage?.candidatesTokenCount ?? null,
    thoughts_token_count: usage?.thoughtsTokenCount ?? null,
    total_token_count: usage?.totalTokenCount ?? null,
    max_output_tokens: COACH_OUTLINE_ONLY_MAX_OUTPUT_TOKENS,
  });

  if (finishReason === 'MAX_TOKENS') {
    const rawText = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    console.log(
      '\n=== TRUNCATED OUTPUT DUMP ===\n',
      rawText.slice(-2000),
      '\n=============================\n',
    );
  }

  const phaseResult = processCoachOutlinePhaseBVertexOutput({ text, finishReason });
  if (!phaseResult.ok) {
    console.error(`${logPrefix} phase b vertex output failed`, {
      error_kind: phaseResult.errorKind,
      message: phaseResult.message,
      drop_count: phaseResult.drops?.length ?? 0,
      drops: phaseResult.drops ?? [],
      finish_reason: finishReason,
      response_text_chars: text?.length ?? 0,
    });
  }
  return phaseResult;
}
