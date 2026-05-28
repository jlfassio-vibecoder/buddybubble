/**
 * Canned Google OAuth + Vertex publisher API responses for Deno integration tests.
 *
 * The test-only service-account JSON returned by `getTestGcpServiceAccountJson`
 * is built lazily at runtime: a fresh PKCS8 RSA key pair is generated via
 * `crypto.subtle.generateKey` the first time the helper is called, exported in
 * PKCS8 DER, base64-encoded, and wrapped in PEM markers. The result is
 * memoized for the lifetime of the test process.
 *
 * No PEM key body or `BEGIN PRIVATE KEY` literal lives in this file at rest,
 * so secret scanners (GitHub Advanced Security et al.) do not flag it. The
 * generated key never leaves the process, is never persisted, and is only
 * used to satisfy `crypto.subtle.importKey` inside `vertex-auth.ts` so the
 * dispatcher can sign a JWT before the mocked OAuth endpoint replies.
 */

import {
  jsonResponse,
  textResponse,
  type MockFetchCall,
  type MockFetchRouteHandler,
} from './fetch-router.ts';

export const TEST_VERTEX_PROJECT = 'test-gcp-project';
export const TEST_VERTEX_LOCATION = 'us-central1';

// Markers are composed at runtime so the literal `-----BEGIN PRIVATE KEY-----`
// string never appears in this source file (avoids tripping secret scanners
// even though the surrounding base64 body is generated, not committed).
const PEM_DASHES = '-----';
const PEM_HEADER = `${PEM_DASHES}${'BEGIN'} PRIVATE KEY${PEM_DASHES}`;
const PEM_FOOTER = `${PEM_DASHES}${'END'} PRIVATE KEY${PEM_DASHES}`;

function pkcs8DerToPem(der: ArrayBuffer): string {
  const bytes = new Uint8Array(der);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64 = btoa(binary);
  const lines = base64.match(/.{1,64}/g) ?? [base64];
  return [PEM_HEADER, ...lines, PEM_FOOTER].join('\n');
}

async function generateTestServiceAccountPem(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const exported = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  return pkcs8DerToPem(exported);
}

let cachedServiceAccountJson: string | null = null;

/**
 * Returns the synthetic GCP service account JSON used to satisfy
 * `readDispatcherEnv()` and `getVertexAccessToken()` during integration tests.
 *
 * The first call generates a fresh 2048-bit RSA key pair via `crypto.subtle`;
 * subsequent calls return the cached JSON. The `vertex-auth.ts` cache is the
 * one being reset between tests via `_resetVertexAuthCacheForTests()`, so the
 * same PEM is safely reused across every Deno.test in the suite.
 */
export async function getTestGcpServiceAccountJson(): Promise<string> {
  if (cachedServiceAccountJson) return cachedServiceAccountJson;
  const pem = await generateTestServiceAccountPem();
  cachedServiceAccountJson = JSON.stringify({
    type: 'service_account',
    project_id: TEST_VERTEX_PROJECT,
    client_email: 'agent-dispatch-integration@test-gcp-project.iam.gserviceaccount.com',
    private_key: pem,
    token_uri: 'https://oauth2.googleapis.com/token',
  });
  return cachedServiceAccountJson;
}

export type VertexHandlerWithCount = {
  handler: MockFetchRouteHandler;
  count: () => number;
};

export function vertexUrl(call: MockFetchCall): boolean {
  return (
    call.method === 'POST' &&
    call.url.includes('-aiplatform.googleapis.com/v1/projects/') &&
    call.url.endsWith(':generateContent')
  );
}

export function oauthUrl(call: MockFetchCall): boolean {
  return call.method === 'POST' && call.url === 'https://oauth2.googleapis.com/token';
}

function vertexGenerateResponse(
  text: string,
  usage = { promptTokenCount: 101, candidatesTokenCount: 22 },
) {
  return {
    candidates: [{ content: { parts: [{ text }] } }],
    usageMetadata: usage,
  };
}

export function vertexHappy(parsedJson: unknown): VertexHandlerWithCount {
  let calls = 0;
  return {
    count: () => calls,
    handler: () => {
      calls += 1;
      return jsonResponse(vertexGenerateResponse(JSON.stringify(parsedJson)));
    },
  };
}

/** Vertex response truncated by MAX_TOKENS (partial JSON body). */
export function vertexMaxTokens(partialText = '{"reply_content":"partial'): VertexHandlerWithCount {
  let calls = 0;
  return {
    count: () => calls,
    handler: () => {
      calls += 1;
      return jsonResponse({
        candidates: [
          {
            content: { parts: [{ text: partialText }] },
            finishReason: 'MAX_TOKENS',
          },
        ],
        usageMetadata: {
          promptTokenCount: 512,
          candidatesTokenCount: 2048,
          thoughtsTokenCount: 128,
        },
      });
    },
  };
}

/** Returns canned Vertex responses in order (Call A, Call B, …). */
export function vertexHappySequence(parsedJsonSequence: unknown[]): VertexHandlerWithCount {
  let calls = 0;
  return {
    count: () => calls,
    handler: () => {
      const idx = Math.min(calls, Math.max(parsedJsonSequence.length - 1, 0));
      calls += 1;
      return jsonResponse(vertexGenerateResponse(JSON.stringify(parsedJsonSequence[idx])));
    },
  };
}

export type VertexHandlerWithCapturedBody = VertexHandlerWithCount & {
  lastBodyText: () => string | null;
};

/** Like `vertexHappy`, but exposes the raw Vertex request body for prompt assertions. */
export function vertexHappyCapturingBody(parsedJson: unknown): VertexHandlerWithCapturedBody {
  let calls = 0;
  let lastBody: string | null = null;
  return {
    count: () => calls,
    lastBodyText: () => lastBody,
    handler: (_req, call) => {
      calls += 1;
      lastBody = call.bodyText;
      return jsonResponse(vertexGenerateResponse(JSON.stringify(parsedJson)));
    },
  };
}

export function vertex429ThenHappy(parsedJson: unknown): VertexHandlerWithCount {
  let calls = 0;
  return {
    count: () => calls,
    handler: () => {
      calls += 1;
      if (calls === 1) {
        return textResponse('rate limited', 429, { 'retry-after': '1' });
      }
      return jsonResponse(vertexGenerateResponse(JSON.stringify(parsedJson)));
    },
  };
}

/** Hangs until the fetch is aborted; `vertex-gemini` `timeoutMs` triggers timeout path. */
export function vertexHanging(): VertexHandlerWithCount {
  let calls = 0;
  return {
    count: () => calls,
    handler: (req) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        const signal = req.signal;
        if (signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    },
  };
}

export function vertex500Always(): VertexHandlerWithCount {
  let calls = 0;
  return {
    count: () => calls,
    handler: () => {
      calls += 1;
      return textResponse('upstream unavailable', 500);
    },
  };
}

export function vertexMalformedJson(): VertexHandlerWithCount {
  let calls = 0;
  return {
    count: () => calls,
    handler: () => {
      calls += 1;
      return textResponse('not even close to json {{', 200, { 'content-type': 'application/json' });
    },
  };
}

export function vertexShapeViolating(): VertexHandlerWithCount {
  let calls = 0;
  return {
    count: () => calls,
    handler: () => {
      calls += 1;
      return jsonResponse(null);
    },
  };
}

export function googleOAuthHappy(): MockFetchRouteHandler {
  return () =>
    jsonResponse({
      access_token: 'fake-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    });
}

export function googleOAuthAuthError(): MockFetchRouteHandler {
  return () => textResponse('invalid service account', 401);
}
