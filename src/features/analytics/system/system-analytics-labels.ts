import type { SystemAnalyticsErrorFilter } from '@/features/analytics/system/system-analytics-types';

export const SYSTEM_ANALYTICS_EVENT_TYPE_LABELS: Record<string, string> = {
  success: 'Success',
  error_truncated: 'Truncated (MAX_TOKENS)',
  error_attestation: 'Self-attestation mismatch',
  error_parse: 'Parse error',
  error_shape: 'Schema validation',
  error_http: 'HTTP error',
  error_timeout: 'Timeout',
  error_auth: 'Auth error',
  error_other: 'Other error',
};

export const SYSTEM_ANALYTICS_ERROR_KIND_LABELS: Record<string, string> = {
  truncated: 'Truncated',
  self_attestation_mismatch: 'Attestation',
  parse: 'Parse',
  shape: 'Shape',
  http: 'HTTP',
  timeout: 'Timeout',
  auth: 'Auth',
  cue_unanchored: 'Cue unanchored',
};

export const SYSTEM_ANALYTICS_SURFACE_LABELS: Record<string, string> = {
  standard_task_chat_rail: 'Task chat rail',
  workout_builder: 'Workout builder',
  generate_workout_outline: 'Generate outline',
};

export const SYSTEM_ANALYTICS_FILTER_LABELS: Record<SystemAnalyticsErrorFilter, string> = {
  all: 'All errors',
  error_truncated: 'Truncated',
  error_attestation: 'Attestation',
  error_parse: 'Parse',
  error_shape: 'Shape',
  error_http: 'HTTP',
  error_timeout: 'Timeout',
  error_auth: 'Auth',
  error_other: 'Other',
};

export function labelEventType(eventType: string): string {
  return SYSTEM_ANALYTICS_EVENT_TYPE_LABELS[eventType] ?? eventType;
}

export function labelErrorKind(errorKind: string | null): string {
  if (!errorKind) return '—';
  return SYSTEM_ANALYTICS_ERROR_KIND_LABELS[errorKind] ?? errorKind;
}

export function labelSurface(surface: string | null): string {
  if (!surface) return '—';
  return SYSTEM_ANALYTICS_SURFACE_LABELS[surface] ?? surface;
}
