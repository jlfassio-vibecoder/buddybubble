/**
 * Vertex AI OpenAPI chat client (DeepSeek v3.2) — aligned with Interval Timers env vars.
 *
 * Env (server / Route Handlers only):
 * - GOOGLE_PROJECT_ID or GOOGLE_CLOUD_PROJECT_ID (or project_id inside service account JSON)
 * - GOOGLE_LOCATION / GOOGLE_CLOUD_LOCATION / VERTEX_LOCATION (default "global")
 * - GOOGLE_APPLICATION_CREDENTIALS_JSON | BASE64 | file path
 */

import { existsSync, readFileSync } from 'node:fs';

const MAX_ERROR_LOG_LENGTH = 500;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export type VertexAICredentials =
  | { projectId: string; region: string; accessToken: string }
  | { error: Response };

function readProcessEnv(key: string): string | undefined {
  if (typeof process === 'undefined') return undefined;
  const v = process.env[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function tryDecodeJsonEnvAsBase64(s: string): string | undefined {
  const t = s.trim();
  if (t.startsWith('{')) return undefined;
  try {
    const decoded = stripBom(Buffer.from(t, 'base64').toString('utf8'));
    return decoded.trim().startsWith('{') ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function resolveServiceAccountJsonRaw(logPrefix: string): string | undefined {
  const inline = readProcessEnv('GOOGLE_APPLICATION_CREDENTIALS_JSON');
  if (inline) {
    const bom = stripBom(inline);
    const fromB64 = tryDecodeJsonEnvAsBase64(bom);
    if (fromB64) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          `${logPrefix} GOOGLE_APPLICATION_CREDENTIALS_JSON is base64-encoded; decoded OK.`,
        );
      }
      return fromB64;
    }
    return bom;
  }

  const b64 = readProcessEnv('GOOGLE_APPLICATION_CREDENTIALS_BASE64');
  if (b64) {
    try {
      return stripBom(Buffer.from(b64, 'base64').toString('utf8'));
    } catch (e) {
      console.error(`${logPrefix} GOOGLE_APPLICATION_CREDENTIALS_BASE64 decode failed:`, e);
      return undefined;
    }
  }

  const filePath = readProcessEnv('GOOGLE_APPLICATION_CREDENTIALS');
  if (filePath) {
    if (!existsSync(filePath)) {
      console.error(`${logPrefix} GOOGLE_APPLICATION_CREDENTIALS file not found:`, filePath);
      return undefined;
    }
    try {
      return stripBom(readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error(`${logPrefix} Failed to read GOOGLE_APPLICATION_CREDENTIALS:`, e);
      return undefined;
    }
  }
  return undefined;
}

function hasAnyServiceAccountEnv(): boolean {
  return !!(
    readProcessEnv('GOOGLE_APPLICATION_CREDENTIALS_JSON') ||
    readProcessEnv('GOOGLE_APPLICATION_CREDENTIALS_BASE64') ||
    readProcessEnv('GOOGLE_APPLICATION_CREDENTIALS')
  );
}

export function resolveGoogleProjectId(): string | undefined {
  return (
    readProcessEnv('GOOGLE_PROJECT_ID') ||
    readProcessEnv('GOOGLE_CLOUD_PROJECT_ID') ||
    readProcessEnv('PUBLIC_FIREBASE_PROJECT_ID')
  );
}

export function resolveGoogleLocation(): string {
  return (
    readProcessEnv('GOOGLE_LOCATION') ||
    readProcessEnv('GOOGLE_CLOUD_LOCATION') ||
    readProcessEnv('VERTEX_LOCATION') ||
    'global'
  );
}

export async function getVertexAICredentials(
  logPrefix = '[vertex-ai]',
): Promise<VertexAICredentials> {
  const envProjectId = resolveGoogleProjectId();
  const credentialsJsonRaw = resolveServiceAccountJsonRaw(logPrefix);
  const region = resolveGoogleLocation();

  try {
    let projectId = envProjectId ?? undefined;
    let parsedKey: { client_email: string; private_key: string; project_id?: string } | undefined;
    if (credentialsJsonRaw) {
      parsedKey = parseServiceAccountJson(credentialsJsonRaw, logPrefix);
      if (typeof parsedKey.project_id === 'string' && parsedKey.project_id) {
        projectId = parsedKey.project_id;
      }
    }
    if (!projectId) {
      return {
        error: new Response(
          JSON.stringify({
            error:
              'GOOGLE_PROJECT_ID or GOOGLE_CLOUD_PROJECT_ID not set. Add one to .env / Vercel env for AI generation.',
          }),
          { status: 500, headers: JSON_HEADERS },
        ),
      };
    }

    const { GoogleAuth } = await import('google-auth-library');
    const auth = parsedKey
      ? new GoogleAuth({
          credentials: { client_email: parsedKey.client_email, private_key: parsedKey.private_key },
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          projectId,
        })
      : new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          projectId,
        });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) throw new Error('Failed to get access token');
    return { projectId, region, accessToken: tokenResponse.token };
  } catch (err) {
    console.error(`${logPrefix} Auth error:`, err);
    const isVercel = readProcessEnv('VERCEL') === '1';
    const hasSa = hasAnyServiceAccountEnv();
    const errMsg = err instanceof Error ? err.message : String(err);
    if (process.env.NODE_ENV === 'development') {
      console.error(`${logPrefix} Vertex auth detail:`, errMsg);
    }
    const hint = hasSa
      ? 'Check service account JSON (valid JSON, unexpired key, private_key newlines). Or set GOOGLE_APPLICATION_CREDENTIALS to a .json file path locally. Ensure roles/aiplatform.user on the GCP project.'
      : isVercel
        ? 'AI generation on Vercel requires GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS_BASE64 (service account with Vertex AI User).'
        : 'Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path, or GOOGLE_APPLICATION_CREDENTIALS_JSON / BASE64, or run: gcloud auth application-default login';
    const devSuffix = process.env.NODE_ENV === 'development' ? ` [${errMsg}]` : '';
    return {
      error: new Response(
        JSON.stringify({
          error: `Authentication failed. ${hint}${devSuffix}`,
        }),
        { status: 500, headers: JSON_HEADERS },
      ),
    };
  }
}

function normalizePemPrivateKey(pem: string): string {
  let p = pem.replace(/\r\n/g, '\n');
  p = p.replace(/\\n/g, '\n').trim();
  if (p.includes('BEGIN PRIVATE KEY') && !/\n/.test(p.slice(0, 80))) {
    p = p
      .replace(/-----BEGIN PRIVATE KEY-----/, '-----BEGIN PRIVATE KEY-----\n')
      .replace(/-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----');
  }
  return p;
}

function parseServiceAccountJson(
  json: string,
  logPrefix: string,
): { client_email: string; private_key: string; project_id?: string } {
  const trimmed = json.trim();
  const key = JSON.parse(trimmed) as Record<string, unknown>;
  if (!key || typeof key.client_email !== 'string' || typeof key.private_key !== 'string') {
    throw new Error('Missing client_email or private_key in service account JSON');
  }
  const privateKey = normalizePemPrivateKey(key.private_key as string);
  const project_id =
    typeof key.project_id === 'string' && key.project_id ? key.project_id : undefined;
  return { client_email: key.client_email, private_key: privateKey, project_id };
}

export interface VertexAICallOptions {
  systemPrompt: string;
  userPrompt: string;
  accessToken: string;
  projectId: string;
  region: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  logPrefix?: string;
}

export async function callVertexAI(options: VertexAICallOptions): Promise<string> {
  const {
    systemPrompt,
    userPrompt,
    accessToken,
    projectId,
    region,
    temperature = 0.5,
    maxTokens = 4096,
    timeoutMs = 180000,
    logPrefix = '[vertex-ai]',
  } = options;

  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/endpoints/openapi/chat/completions`;

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
        body: JSON.stringify({
          model: 'deepseek-ai/deepseek-v3.2-maas',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) break;

    if (response.status === 403) {
      const errorText = await response.text();
      let hint =
        'The service account or user does not have permission to call Vertex AI in this project. ';
      try {
        const errJson = JSON.parse(errorText) as { error?: { message?: string } };
        if (errJson?.error?.message?.includes('aiplatform.endpoints.predict')) {
          hint +=
            'Grant the service account Vertex AI User (roles/aiplatform.user) on the GCP project.';
        }
      } catch {
        // ignore
      }
      throw new Error(`AI API error: 403 - ${hint}`);
    }

    const isRetryable = response.status === 429 || response.status === 503;
    const totalAttempts = maxRetries + 1;
    if (isRetryable && retries < maxRetries) {
      const delay = baseDelay * Math.pow(2, retries);
      const reason = response.status === 429 ? 'Rate limited' : 'Service unavailable';
      console.warn(
        `${logPrefix} ${reason} (${response.status}). Attempt ${retries + 1}/${totalAttempts} failed; retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
      retries++;
      continue;
    }

    const errorText = await response.text();
    throw new Error(
      `AI API error: ${response.status} - ${errorText.substring(0, MAX_ERROR_LOG_LENGTH)}`,
    );
  }

  if (!response || !response.ok) {
    throw new Error('Failed to get AI response after retries');
  }

  const rawBody = await response.text();
  let apiData: unknown;
  try {
    apiData = JSON.parse(rawBody);
  } catch {
    throw new Error(
      `AI API returned non-JSON. Body: ${rawBody.substring(0, MAX_ERROR_LOG_LENGTH)}`,
    );
  }
  if (apiData && typeof apiData === 'object' && 'choices' in apiData) {
    const choices = (apiData as { choices?: Array<{ message?: { content?: string } }> }).choices;
    if (choices?.[0]?.message?.content) {
      return choices[0].message.content;
    }
  }
  if (
    apiData &&
    typeof apiData === 'object' &&
    'content' in apiData &&
    typeof (apiData as { content: string }).content === 'string'
  ) {
    return (apiData as { content: string }).content;
  }
  throw new Error(
    `Unexpected API response format. Body: ${rawBody.substring(0, MAX_ERROR_LOG_LENGTH)}`,
  );
}
