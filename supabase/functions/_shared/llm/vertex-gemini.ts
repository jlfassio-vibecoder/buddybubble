/**
 * Vertex AI Gemini publisher API client used by the consolidated dispatcher.
 *
 * Endpoint shape:
 *   POST https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent
 *
 * Body shape mirrors the legacy Generative Language API call at
 * `supabase/functions/bubble-agent-dispatch/index.ts` (`geminiGenerateJson` near line 685),
 * so per-strategy `responseSchema` literals can be lifted unchanged into Phase 2 / 4 / 5.
 *
 * Auth: bearer token from `getVertexAccessToken` (RS256 JWT against a Service Account).
 * Retries: 429 / 500 / 502 / 503 / 504 — up to 2 retries with jittered backoff
 * (200 ms then 700 ms). Other 4xx responses, AbortError, and the OAuth `auth` kind do
 * not retry. A single `AbortController` enforces `timeoutMs` across all attempts.
 */

import { getVertexAccessToken, type VertexAuthEnv } from './vertex-auth.ts';
import { log } from '../obs/log.ts';
import type {
  GeminiContent,
  VertexClassifiedError,
  VertexErrorKind,
  VertexGenerateRequest,
  VertexGenerateResponse,
  VertexResponseSchema,
} from './types.ts';

export type GenerateContentArgs = {
  project: string;
  location: string;
  model: string;
  systemPrompt: string;
  contents: GeminiContent[];
  generationConfig: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: 'application/json' | 'text/plain';
    responseSchema?: VertexResponseSchema;
    [key: string]: unknown;
  };
  timeoutMs: number;
  /** Optional caller-supplied signal (e.g. dispatcher's request-scoped abort). */
  signal?: AbortSignal;
  /** Overrides used for testing the auth token retrieval. */
  env: VertexAuthEnv;
  /**
   * When true, emits `level: 'debug'` log lines with the full Vertex request
   * payload and any non-2xx response body (per attempt). Wired from the
   * dispatcher's `LLM_DEBUG=1` env flag. High-volume; use only during incident
   * response, never as the steady-state setting.
   */
  debug?: boolean;
  /**
   * Optional agent slug attached to debug log lines so they can be filtered
   * alongside the rest of the dispatch trace (matches the `LogFields.slug`
   * key from `_shared/obs/log.ts`).
   */
  slug?: string;
};

const RETRY_DELAYS_MS: ReadonlyArray<number> = [200, 700];
const RETRYABLE_STATUSES = new Set<number>([429, 500, 502, 503, 504]);

function buildEndpoint(project: string, location: string, model: string): string {
  return (
    `https://${location}-aiplatform.googleapis.com/v1` +
    `/projects/${project}/locations/${location}` +
    `/publishers/google/models/${model}:generateContent`
  );
}

function classifiedHttp(status: number, body: string): VertexClassifiedError {
  return { kind: 'http', status, body: body.slice(0, 800) };
}

function classifiedParse(body: string): VertexClassifiedError {
  return { kind: 'parse', body: body.slice(0, 800) };
}

function classifiedShape(detail: string): VertexClassifiedError {
  return { kind: 'shape', detail };
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function jitter(baseMs: number): number {
  return baseMs + Math.floor(Math.random() * Math.min(baseMs, 250));
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const handle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(handle);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason ?? new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function combineSignals(...signals: Array<AbortSignal | undefined>): AbortController {
  const controller = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort(s.reason);
      return controller;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller;
}

/**
 * Concatenate every `text` part in the first candidate. Vertex JSON mode is usually
 * single-part; multi-part-aware to avoid silent truncation. Lifted from the legacy
 * `extractGeminiText` at `supabase/functions/bubble-agent-dispatch/index.ts:658-668`.
 */
export function extractGeminiText(
  candidate:
    | {
        content?: { parts?: Array<{ text?: string }> };
      }
    | undefined,
): string {
  const parts = candidate?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
}

/** Map an unknown error to the dispatcher's fallback-decision discriminator. */
export function classifyError(err: unknown): VertexErrorKind {
  if (err && typeof err === 'object' && 'kind' in err) {
    const kind = (err as { kind?: unknown }).kind;
    if (
      kind === 'http' ||
      kind === 'parse' ||
      kind === 'shape' ||
      kind === 'timeout' ||
      kind === 'auth'
    ) {
      return kind;
    }
  }
  if (isAbortError(err)) return 'timeout';
  return 'http';
}

/**
 * Call Vertex publisher API `:generateContent` with retry/backoff and a hard time budget.
 * Returns the raw `VertexGenerateResponse` so per-strategy parsers can pull text + usage.
 *
 * Throws a `VertexClassifiedError`-shaped object — never a generic `Error.message`-coded
 * string — so the dispatcher can branch on `kind` without parsing message text.
 */
export async function generateContent(args: GenerateContentArgs): Promise<VertexGenerateResponse> {
  const accessToken = await getVertexAccessToken(args.env);

  const endpoint = buildEndpoint(args.project, args.location, args.model);
  const requestBody: VertexGenerateRequest = {
    system_instruction: { parts: [{ text: args.systemPrompt }] },
    contents: args.contents,
    generationConfig: args.generationConfig,
  };
  const serializedBody = JSON.stringify(requestBody);

  if (args.debug) {
    log('debug', 'LLM request payload', {
      slug: args.slug,
      model: args.model,
      body: serializedBody,
    });
  }

  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), args.timeoutMs);

  try {
    let lastErr: VertexClassifiedError | null = null;

    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const perAttemptController = combineSignals(timeoutController.signal, args.signal);

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
          },
          body: serializedBody,
          signal: perAttemptController.signal,
        });
      } catch (err) {
        if (timeoutController.signal.aborted) throw { kind: 'timeout' } as VertexClassifiedError;
        if (isAbortError(err)) throw { kind: 'timeout' } as VertexClassifiedError;
        const message = err instanceof Error ? err.message : String(err);
        lastErr = classifiedHttp(0, `network: ${message}`);
        if (attempt < RETRY_DELAYS_MS.length) {
          await delay(jitter(RETRY_DELAYS_MS[attempt]), timeoutController.signal);
          continue;
        }
        throw lastErr;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        if (args.debug) {
          log('debug', 'LLM error response', {
            slug: args.slug,
            model: args.model,
            http_status: response.status,
            attempt,
            body: text,
          });
        }
        if (RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_DELAYS_MS.length) {
          lastErr = classifiedHttp(response.status, text);
          await delay(jitter(RETRY_DELAYS_MS[attempt]), timeoutController.signal);
          continue;
        }
        throw classifiedHttp(response.status, text);
      }

      let bodyText: string;
      try {
        bodyText = await response.text();
      } catch (err) {
        throw classifiedParse(`failed to read body: ${(err as Error).message}`);
      }

      let parsed: VertexGenerateResponse;
      try {
        parsed = JSON.parse(bodyText) as VertexGenerateResponse;
      } catch {
        throw classifiedParse(bodyText);
      }
      if (!parsed || typeof parsed !== 'object') {
        throw classifiedShape('vertex response was not an object');
      }
      return parsed;
    }

    throw lastErr ?? classifiedHttp(0, 'unknown vertex error');
  } finally {
    clearTimeout(timeoutHandle);
  }
}
