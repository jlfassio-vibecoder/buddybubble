/**
 * MIRROR FILE — canonical lives at `supabase/functions/_shared/llm/types.ts`.
 *
 * Exists so the byte-for-byte mirror of `_shared/dispatch/types.ts` (under
 * `src/lib/agents/_shared/dispatch/types.ts`) can import `GeminiContent` and
 * `VertexResponseSchema` from a relative path that resolves under both Deno (Supabase
 * Edge runtime) and Node/Vitest. Any change here MUST be mirrored on the Deno side.
 * Run `pnpm check:agent-mirror` to verify parity.
 *
 * Pure types only. Body below is byte-identical to the canonical Deno file (excluding
 * this header).
 */

/** Conversation turn passed to Vertex publisher API in `contents`. */
export type GeminiContent = {
  role: 'user' | 'model' | 'system';
  parts: Array<{ text: string }>;
};

/**
 * `responseSchema` shape Vertex publisher API accepts when `responseMimeType` is
 * `application/json`. Intentionally permissive — strategy modules supply concrete shapes.
 */
export type VertexResponseSchema = {
  type: string;
  description?: string;
  nullable?: boolean;
  enum?: ReadonlyArray<string>;
  items?: VertexResponseSchema;
  properties?: Record<string, VertexResponseSchema>;
  required?: ReadonlyArray<string>;
  maxLength?: number;
  [key: string]: unknown;
};

/** Vertex publisher API `generateContent` request body. */
export type VertexGenerateRequest = {
  system_instruction?: { parts: Array<{ text: string }> };
  contents: GeminiContent[];
  generationConfig: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: 'application/json' | 'text/plain';
    responseSchema?: VertexResponseSchema;
    [key: string]: unknown;
  };
  safetySettings?: Array<{ category: string; threshold: string }>;
};

/** Subset of the Vertex `generateContent` response we currently consume. */
export type VertexGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
    safetyRatings?: unknown;
  }>;
  /** Vertex returns token usage when available; useful for the structured logger. */
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    /** Gemini 2.5+ thinking tokens (when present); counted against `maxOutputTokens`. */
    thoughtsTokenCount?: number;
  };
};

/**
 * Discriminator the dispatcher uses to decide whether to insert a safe-reply or surface
 * the error as HTTP 500.
 *
 * - `http`    Vertex returned a non-retriable HTTP error (400/401/403/404 etc.).
 * - `parse`   Response was not valid JSON (or the candidate was empty).
 * - `shape`   Response was valid JSON but did not satisfy the strategy's parser.
 * - `timeout` `AbortSignal.timeout` fired before any response.
 * - `auth`    OAuth token exchange with Google failed; operationally distinct from `http`.
 * - `truncated` Vertex candidate `finishReason` is `MAX_TOKENS`; output incomplete.
 * - `self_attestation_mismatch` Coach reply_content claimed a write without structured fields.
 * - `cue_unanchored` Coach emitted personal_cues_patch rows with no catalog dictionary id (logged / classified when thrown).
 */
export type VertexErrorKind =
  | 'http'
  | 'parse'
  | 'shape'
  | 'timeout'
  | 'auth'
  | 'truncated'
  | 'self_attestation_mismatch'
  | 'cue_unanchored';

/** Discriminated error union thrown by `vertex-gemini.ts` and `vertex-auth.ts`. */
export type VertexClassifiedError =
  | { kind: 'http'; status: number; body: string }
  | { kind: 'parse'; body: string }
  | { kind: 'shape'; detail: string }
  | { kind: 'timeout' }
  | { kind: 'auth'; status?: number; body?: string }
  | { kind: 'truncated'; body?: string }
  | { kind: 'self_attestation_mismatch' }
  | { kind: 'cue_unanchored' };
