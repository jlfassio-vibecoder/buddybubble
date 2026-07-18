/**
 * Active/passive Agora credential selection for Cloud Recording REST calls.
 *
 * `AGORA_ACTIVE_ENV === 'SECONDARY'` (case-insensitive, trimmed) selects the
 * `*_SECONDARY` variables as an **atomic unit**. If any mandatory secondary key
 * is missing/blank, every field is returned unset so callers hit
 * `agora_not_configured` — never a hybrid primary/secondary project pair.
 *
 * Primary mode uses base names with optional `*_PRIMARY` suffix fallbacks.
 *
 * The App Certificate is included because `agora-recording-start` builds the
 * recording bot's RTC token — the certificate must belong to the same Agora
 * project as the active App ID.
 */

export type AgoraRestCredentials = {
  appId: string | undefined;
  customerId: string | undefined;
  customerSecret: string | undefined;
  appCertificate: string | undefined;
};

const UNCONFIGURED: AgoraRestCredentials = {
  appId: undefined,
  customerId: undefined,
  customerSecret: undefined,
  appCertificate: undefined,
};

/** Trim and treat empty strings as unset. */
function trimmedEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function primaryEnv(name: string): string | undefined {
  return trimmedEnv(Deno.env.get(name)) ?? trimmedEnv(Deno.env.get(`${name}_PRIMARY`));
}

export function resolveAgoraCredentials(): AgoraRestCredentials {
  const activeEnv = Deno.env.get('AGORA_ACTIVE_ENV')?.trim().toUpperCase();
  if (activeEnv === 'SECONDARY') {
    const appId = trimmedEnv(Deno.env.get('AGORA_APP_ID_SECONDARY'));
    const customerId = trimmedEnv(Deno.env.get('AGORA_CUSTOMER_ID_SECONDARY'));
    const customerSecret = trimmedEnv(Deno.env.get('AGORA_CUSTOMER_SECRET_SECONDARY'));
    const appCertificate = trimmedEnv(Deno.env.get('AGORA_APP_CERTIFICATE_SECONDARY'));
    if (!appId || !customerId || !customerSecret || !appCertificate) {
      return UNCONFIGURED;
    }
    return { appId, customerId, customerSecret, appCertificate };
  }

  return {
    appId: primaryEnv('AGORA_APP_ID'),
    customerId: primaryEnv('AGORA_CUSTOMER_ID'),
    customerSecret: primaryEnv('AGORA_CUSTOMER_SECRET'),
    appCertificate: primaryEnv('AGORA_APP_CERTIFICATE'),
  };
}
