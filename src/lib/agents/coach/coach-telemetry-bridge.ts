import type { SessionTelemetrySnapshot } from '@/lib/workout-factory/session-telemetry';
import type { Json } from '@/types/database';

export const MESSAGE_METADATA_SESSION_TELEMETRY_KEY = 'session_telemetry' as const;
export const MESSAGE_METADATA_SESSION_TELEMETRY_FINGERPRINT_KEY =
  'session_telemetry_fingerprint' as const;

export function sessionTelemetryMetadataFields(snapshot: SessionTelemetrySnapshot): {
  [MESSAGE_METADATA_SESSION_TELEMETRY_KEY]: SessionTelemetrySnapshot;
  [MESSAGE_METADATA_SESSION_TELEMETRY_FINGERPRINT_KEY]: string;
} {
  return {
    [MESSAGE_METADATA_SESSION_TELEMETRY_KEY]: snapshot,
    [MESSAGE_METADATA_SESSION_TELEMETRY_FINGERPRINT_KEY]: snapshot.fingerprint,
  };
}

export function appendSessionTelemetryToCoachMessageMetadata(
  metadata: Record<string, unknown>,
  snapshot: SessionTelemetrySnapshot,
): Json {
  return {
    ...metadata,
    ...sessionTelemetryMetadataFields(snapshot),
  } as Json;
}
