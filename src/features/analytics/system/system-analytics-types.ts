export type SystemAnalyticsWindow = '24h' | '7d' | '30d';

export type SystemAnalyticsErrorFilter =
  | 'all'
  | 'error_truncated'
  | 'error_attestation'
  | 'error_parse'
  | 'error_shape'
  | 'error_http'
  | 'error_timeout'
  | 'error_auth'
  | 'error_other';

export const SYSTEM_ANALYTICS_ERROR_FILTERS: SystemAnalyticsErrorFilter[] = [
  'all',
  'error_truncated',
  'error_attestation',
  'error_parse',
  'error_shape',
  'error_http',
  'error_timeout',
  'error_auth',
  'error_other',
];

export type SystemAnalyticsEventRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_display: string | null;
  surface: string | null;
  event_type: string;
  error_kind: string | null;
  task_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  thoughts_tokens: number | null;
  request_id: string | null;
  agent_slug: string;
};

export type SystemAnalyticsSummary = {
  successCount: number;
  fallbackCount: number;
  errorCount: number;
  totalTokens: number;
  avgLatencyMs: number | null;
};

export function parseSystemAnalyticsWindow(raw: string | undefined): SystemAnalyticsWindow {
  if (raw === '24h' || raw === '7d' || raw === '30d') return raw;
  return '30d';
}

export function windowSinceIso(window: SystemAnalyticsWindow): string {
  const ms =
    window === '24h'
      ? 24 * 60 * 60 * 1000
      : window === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export function parseSystemAnalyticsErrorFilter(
  raw: string | undefined,
): SystemAnalyticsErrorFilter {
  if (raw && SYSTEM_ANALYTICS_ERROR_FILTERS.includes(raw as SystemAnalyticsErrorFilter)) {
    return raw as SystemAnalyticsErrorFilter;
  }
  return 'all';
}

export function encodeSystemAnalyticsCursor(createdAt: string, id: string): string {
  return `${createdAt}|${id}`;
}

export function decodeSystemAnalyticsCursor(
  raw: string | undefined,
): { createdAt: string; id: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf('|');
  if (idx <= 0) return null;
  const createdAt = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (!createdAt || !id) return null;
  return { createdAt, id };
}

export function computeSystemAnalyticsSummary(
  rows: ReadonlyArray<{
    event_type: string;
    prompt_tokens: number | null;
    completion_tokens: number | null;
    thoughts_tokens: number | null;
    latency_ms: number | null;
  }>,
): SystemAnalyticsSummary {
  let successCount = 0;
  let fallbackCount = 0;
  let errorCount = 0;
  let totalTokens = 0;
  let latencySum = 0;
  let latencyCount = 0;

  for (const row of rows) {
    if (row.event_type === 'success') {
      successCount += 1;
    } else if (row.event_type === 'success_fallback') {
      fallbackCount += 1;
    } else {
      errorCount += 1;
    }
    totalTokens +=
      (row.prompt_tokens ?? 0) + (row.completion_tokens ?? 0) + (row.thoughts_tokens ?? 0);
    if (row.latency_ms != null && Number.isFinite(row.latency_ms)) {
      latencySum += row.latency_ms;
      latencyCount += 1;
    }
  }

  return {
    successCount,
    fallbackCount,
    errorCount,
    totalTokens,
    avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
  };
}
