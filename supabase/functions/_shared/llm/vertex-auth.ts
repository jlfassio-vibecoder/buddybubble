/**
 * Vertex AI OAuth via GCP Service Account JSON.
 *
 * Builds an RS256 JWT with WebCrypto, exchanges it for a `cloud-platform`-scoped access
 * token at `https://oauth2.googleapis.com/token`, and caches the token in module scope
 * until `expiry - 60s`.
 *
 * Lazy by design — no work happens at import time. Local `deno test` runs that import
 * adjacent `_shared` modules without `GCP_SERVICE_ACCOUNT_JSON` defined will not crash.
 */

import type { VertexClassifiedError } from './types.ts';

/** Minimal env contract this module needs. Decoupled from `_shared/env.ts` on purpose. */
export type VertexAuthEnv = {
  GCP_SERVICE_ACCOUNT_JSON: string;
};

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type CachedToken = {
  token: string;
  /** Unix epoch milliseconds. */
  expiresAtMs: number;
};

const TOKEN_REFRESH_LEEWAY_MS = 60_000;
const OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const OAUTH_AUDIENCE = OAUTH_TOKEN_ENDPOINT;
const OAUTH_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const JWT_LIFETIME_SECONDS = 3600;

let cachedServiceAccount: ServiceAccount | null = null;
let cachedSigningKey: CryptoKey | null = null;
let cachedToken: CachedToken | null = null;
let inFlight: Promise<string> | null = null;

function authError(status: number | undefined, body: string | undefined): VertexClassifiedError {
  return { kind: 'auth', status, body };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToPkcs8Bytes(pem: string): Uint8Array<ArrayBuffer> {
  const normalized = pem.replace(/\\n/g, '\n');
  const stripped = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  if (!stripped) {
    throw authError(undefined, 'GCP_SERVICE_ACCOUNT_JSON.private_key was empty');
  }
  const binary = atob(stripped);
  // Allocate over an explicit ArrayBuffer so the Uint8Array narrows to
  // Uint8Array<ArrayBuffer> (not the looser ArrayBufferLike, which TS 5.7+ rejects as
  // BufferSource because it could be a SharedArrayBuffer).
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseServiceAccount(raw: string): ServiceAccount {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw authError(
      undefined,
      `GCP_SERVICE_ACCOUNT_JSON is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw authError(undefined, 'GCP_SERVICE_ACCOUNT_JSON did not parse to an object');
  }
  const obj = parsed as Record<string, unknown>;
  const clientEmail = obj.client_email;
  const privateKey = obj.private_key;
  if (typeof clientEmail !== 'string' || !clientEmail.includes('@')) {
    throw authError(undefined, 'GCP_SERVICE_ACCOUNT_JSON.client_email is missing/invalid');
  }
  if (typeof privateKey !== 'string' || !privateKey.includes('PRIVATE KEY')) {
    throw authError(undefined, 'GCP_SERVICE_ACCOUNT_JSON.private_key is missing/invalid');
  }
  const tokenUri = typeof obj.token_uri === 'string' ? obj.token_uri : undefined;
  return { client_email: clientEmail, private_key: privateKey, token_uri: tokenUri };
}

async function ensureSigningKey(account: ServiceAccount): Promise<CryptoKey> {
  if (cachedSigningKey) return cachedSigningKey;
  const pkcs8 = pemToPkcs8Bytes(account.private_key);
  cachedSigningKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return cachedSigningKey;
}

async function buildSignedJwt(account: ServiceAccount): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: account.client_email,
    scope: OAUTH_SCOPE,
    aud: account.token_uri || OAUTH_AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
  };
  const signingInput = `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}`;
  const key = await ensureSigningKey(account);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function exchangeJwtForToken(account: ServiceAccount): Promise<CachedToken> {
  const jwt = await buildSignedJwt(account);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const endpoint = account.token_uri || OAUTH_TOKEN_ENDPOINT;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (err) {
    throw authError(undefined, `oauth2 fetch failed: ${(err as Error).message}`);
  }

  const text = await res.text();
  if (!res.ok) throw authError(res.status, text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw authError(res.status, `oauth2 response not JSON: ${(err as Error).message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw authError(res.status, 'oauth2 response was not an object');
  }
  const obj = parsed as Record<string, unknown>;
  const accessToken = obj.access_token;
  const expiresIn = obj.expires_in;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw authError(res.status, 'oauth2 response missing access_token');
  }
  const lifetimeSeconds = typeof expiresIn === 'number' && expiresIn > 0 ? expiresIn : 3600;
  return {
    token: accessToken,
    expiresAtMs: Date.now() + lifetimeSeconds * 1000,
  };
}

/**
 * Returns a cached `cloud-platform`-scoped access token, refreshing when the cached value
 * is within `TOKEN_REFRESH_LEEWAY_MS` of expiry. Concurrent callers share a single
 * in-flight refresh.
 */
export async function getVertexAccessToken(env: VertexAuthEnv): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_REFRESH_LEEWAY_MS > now) {
    return cachedToken.token;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      if (!cachedServiceAccount) {
        cachedServiceAccount = parseServiceAccount(env.GCP_SERVICE_ACCOUNT_JSON);
      }
      const fresh = await exchangeJwtForToken(cachedServiceAccount);
      cachedToken = fresh;
      return fresh.token;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test/debug-only: clear the cached token and parsed service account. */
export function _resetVertexAuthCacheForTests(): void {
  cachedServiceAccount = null;
  cachedSigningKey = null;
  cachedToken = null;
  inFlight = null;
}
