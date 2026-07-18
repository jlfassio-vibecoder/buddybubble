import 'server-only';

import { trimmedEnv } from '@/lib/env/trimmed-env';

export type AgoraCredentials = {
  appId: string | undefined;
  appCertificate: string | undefined;
};

const UNCONFIGURED: AgoraCredentials = {
  appId: undefined,
  appCertificate: undefined,
};

/**
 * Resolve the active Agora RTC project.
 *
 * `AGORA_ACTIVE_ENV=SECONDARY` selects the secondary project as an **atomic unit**:
 * both `AGORA_APP_ID_SECONDARY` and `AGORA_APP_CERTIFICATE_SECONDARY` must be present
 * after trim, or the result is fully unconfigured (no per-field primary fallback).
 * Primary mode still allows base names with `*_PRIMARY` suffix fallbacks.
 */
export function resolveAgoraCredentials(): AgoraCredentials {
  const activeEnv = process.env.AGORA_ACTIVE_ENV?.trim().toUpperCase();
  if (activeEnv === 'SECONDARY') {
    const appId = trimmedEnv(process.env.AGORA_APP_ID_SECONDARY);
    const appCertificate = trimmedEnv(process.env.AGORA_APP_CERTIFICATE_SECONDARY);
    if (!appId || !appCertificate) {
      return UNCONFIGURED;
    }
    return { appId, appCertificate };
  }

  return {
    appId: trimmedEnv(process.env.AGORA_APP_ID) ?? trimmedEnv(process.env.AGORA_APP_ID_PRIMARY),
    appCertificate:
      trimmedEnv(process.env.AGORA_APP_CERTIFICATE) ??
      trimmedEnv(process.env.AGORA_APP_CERTIFICATE_PRIMARY),
  };
}

/**
 * Resolve the Agora Cloud Recording webhook HMAC secret for the active project.
 * Secondary mode requires `AGORA_WEBHOOK_SECRET_SECONDARY` with no primary fallback.
 */
export function resolveAgoraWebhookSecret(): string | undefined {
  const activeEnv = process.env.AGORA_ACTIVE_ENV?.trim().toUpperCase();
  if (activeEnv === 'SECONDARY') {
    return trimmedEnv(process.env.AGORA_WEBHOOK_SECRET_SECONDARY);
  }
  return (
    trimmedEnv(process.env.AGORA_WEBHOOK_SECRET) ??
    trimmedEnv(process.env.AGORA_WEBHOOK_SECRET_PRIMARY)
  );
}
