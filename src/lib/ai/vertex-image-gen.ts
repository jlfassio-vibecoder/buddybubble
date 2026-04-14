/**
 * Vertex AI Imagen text-to-image (predict) — separate from OpenAPI chat in vertex-ai-client.ts.
 *
 * GCP: enable "Vertex AI API" and Imagen in the console; use a regional endpoint (not `global`).
 * IAM: roles/aiplatform.user on the service account (same as workout Vertex usage).
 *
 * Env (server only):
 * - VERTEX_IMAGE_LOCATION — e.g. us-central1 (default). Must be a region where Imagen is available.
 * - VERTEX_IMAGEN_MODEL — default imagen-3.0-generate-001
 * - Same credential env vars as getVertexAICredentials (GOOGLE_PROJECT_ID, GOOGLE_APPLICATION_CREDENTIALS*, …)
 */

import {
  getVertexAICredentials,
  type VertexAICredentials,
} from '@/lib/workout-factory/vertex-ai-client';

const MAX_ERROR_LOG_LENGTH = 500;

function readEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const v = process.env[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Region for Imagen :predict (must not be `global`). */
export function resolveVertexImageLocation(): string {
  return readEnv('VERTEX_IMAGE_LOCATION') || readEnv('GOOGLE_CLOUD_IMAGE_REGION') || 'us-central1';
}

export function resolveVertexImagenModelId(): string {
  return readEnv('VERTEX_IMAGEN_MODEL') || 'imagen-3.0-generate-001';
}

export interface GenerateVertexImageOptions {
  prompt: string;
  /** Wide hero for Kanban/chat cards */
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4';
  logPrefix?: string;
  timeoutMs?: number;
}

export type VertexImagenPredictInput = {
  projectId: string;
  accessToken: string;
  prompt: string;
  aspectRatio?: GenerateVertexImageOptions['aspectRatio'];
  logPrefix?: string;
  timeoutMs?: number;
};

function extractBase64FromPrediction(p: unknown): string | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const direct = o.bytesBase64Encoded;
  if (typeof direct === 'string' && direct.length > 0) return direct;
  // Some responses nest protobuf-style structs
  const nested = o.structValue as Record<string, unknown> | undefined;
  if (nested?.fields && typeof nested.fields === 'object') {
    const f = (nested.fields as Record<string, unknown>).bytesBase64Encoded as
      | { stringValue?: string }
      | undefined;
    if (typeof f?.stringValue === 'string' && f.stringValue.length > 0) return f.stringValue;
  }
  return null;
}

/**
 * Calls Vertex publisher model :predict and returns raw image bytes (PNG/JPEG).
 * Prefer using this from API routes after `getVertexAICredentials` so credential failures become HTTP responses.
 */
export async function predictImagenImageBytes(input: VertexImagenPredictInput): Promise<Buffer> {
  const {
    projectId,
    accessToken,
    prompt,
    aspectRatio = '16:9',
    logPrefix = '[vertex-imagen]',
    timeoutMs = 120000,
  } = input;

  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new Error('Image prompt is empty');
  }
  if (trimmed.length > 8000) {
    throw new Error('Image prompt is too long');
  }

  const location = resolveVertexImageLocation();
  const modelId = resolveVertexImagenModelId();

  const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predict`;

  const body = {
    instances: [{ prompt: trimmed }],
    parameters: {
      sampleCount: 1,
      aspectRatio,
      safetyFilterLevel: 'block_some',
      personGeneration: 'allow_adult',
    },
  };

  let response: Response | undefined;
  let retries = 0;
  const maxRetries = 3;
  const baseDelay = 2000;

  while (retries <= maxRetries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) break;

    const isRetryable = response.status === 429 || response.status === 503;
    if (isRetryable && retries < maxRetries) {
      const delay = baseDelay * Math.pow(2, retries);
      console.warn(
        `${logPrefix} predict ${response.status}; retry ${retries + 1}/${maxRetries + 1} in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
      retries++;
      continue;
    }

    const errorText = await response.text();
    throw new Error(
      `Vertex Imagen error: ${response.status} — ${errorText.substring(0, MAX_ERROR_LOG_LENGTH)}`,
    );
  }

  if (!response?.ok) {
    throw new Error('Vertex Imagen predict failed after retries');
  }

  const rawJson = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(rawJson);
  } catch {
    throw new Error(`Imagen returned non-JSON: ${rawJson.substring(0, MAX_ERROR_LOG_LENGTH)}`);
  }

  const predictions =
    data &&
    typeof data === 'object' &&
    'predictions' in data &&
    Array.isArray((data as { predictions: unknown }).predictions)
      ? (data as { predictions: unknown[] }).predictions
      : null;

  if (!predictions?.length) {
    throw new Error(
      `Imagen returned no predictions. Body: ${rawJson.substring(0, MAX_ERROR_LOG_LENGTH)}`,
    );
  }

  const b64 = extractBase64FromPrediction(predictions[0]);
  if (!b64) {
    throw new Error(
      `Could not read image bytes from prediction. Body: ${rawJson.substring(0, MAX_ERROR_LOG_LENGTH)}`,
    );
  }

  return Buffer.from(b64, 'base64');
}

/**
 * Convenience: OAuth + Imagen predict. Returns `Response` when Vertex auth env is misconfigured.
 */
export async function generateImageBytesWithVertexImagen(
  options: GenerateVertexImageOptions,
): Promise<Buffer | { error: Response }> {
  const creds: VertexAICredentials = await getVertexAICredentials(
    options.logPrefix ?? '[vertex-imagen]',
  );
  if ('error' in creds) {
    return creds;
  }
  const bytes = await predictImagenImageBytes({
    projectId: creds.projectId,
    accessToken: creds.accessToken,
    prompt: options.prompt,
    aspectRatio: options.aspectRatio,
    logPrefix: options.logPrefix,
    timeoutMs: options.timeoutMs,
  });
  return bytes;
}
