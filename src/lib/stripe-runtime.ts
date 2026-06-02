/**
 * Stripe key mode and deploy environment helpers (server-only).
 *
 * @see docs/technical-design-stripe-dual-mode-and-billing-funnel-analytics-v1.md
 */

export type StripeKeyMode = 'test' | 'live';

/** Trim whitespace and optional wrapping quotes from Vercel/Dashboard paste. */
export function normalizeStripeEnvKey(key: string | undefined): string | undefined {
  if (key == null) return undefined;
  let k = key.trim();
  if (
    (k.length >= 2 && k.startsWith('"') && k.endsWith('"')) ||
    (k.startsWith("'") && k.endsWith("'"))
  ) {
    k = k.slice(1, -1).trim();
  }
  return k.length > 0 ? k : undefined;
}

export function stripeKeyModeFromSecretKey(secretKey: string | undefined): StripeKeyMode | null {
  const k = normalizeStripeEnvKey(secretKey);
  if (!k) return null;
  if (k.startsWith('sk_test_') || k.startsWith('rk_test_')) return 'test';
  if (k.startsWith('sk_live_') || k.startsWith('rk_live_')) return 'live';
  return null;
}

export function stripeKeyModeFromPublishableKey(
  publishableKey: string | undefined,
): StripeKeyMode | null {
  const k = normalizeStripeEnvKey(publishableKey);
  if (!k) return null;
  if (k.startsWith('pk_test_')) return 'test';
  if (k.startsWith('pk_live_')) return 'live';
  return null;
}

/** Vercel-style deploy tier for analytics; falls back to `local` when unset. */
export function billingDeployEnvironment(): 'production' | 'preview' | 'local' {
  const v = process.env.VERCEL_ENV;
  if (v === 'production') return 'production';
  if (v === 'preview') return 'preview';
  return 'local';
}

/**
 * Validates Stripe env on first server use of the SDK.
 * - Secret + publishable (if set) must be the same mode.
 * - Vercel production must not use test keys.
 */
export function assertStripeEnvironment(): void {
  const secret = normalizeStripeEnvKey(process.env.STRIPE_SECRET_KEY);
  const publishable = normalizeStripeEnvKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  const secretMode = stripeKeyModeFromSecretKey(secret);
  if (!secretMode) {
    const hint = secret
      ? secret.startsWith('whsec_')
        ? 'STRIPE_WEBHOOK_SECRET (whsec_) was set on STRIPE_SECRET_KEY — use the secret key (sk_live_ or sk_test_) from API keys instead.'
        : 'Unrecognized prefix.'
      : 'STRIPE_SECRET_KEY is empty or unset.';
    throw new Error(
      `STRIPE_SECRET_KEY must start with sk_test_, sk_live_, rk_test_, or rk_live_. ${hint}`,
    );
  }

  if (publishable) {
    const pubMode = stripeKeyModeFromPublishableKey(publishable);
    if (!pubMode) {
      throw new Error(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY must start with pk_test_ or pk_live_ when set.',
      );
    }
    if (pubMode !== secretMode) {
      throw new Error(
        `Stripe key mismatch: STRIPE_SECRET_KEY is ${secretMode} mode but NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is ${pubMode} mode. They must match.`,
      );
    }
  }

  if (process.env.VERCEL_ENV === 'production' && secretMode === 'test') {
    throw new Error(
      'Production (VERCEL_ENV=production) cannot use sk_test_. Use live Stripe keys on production.',
    );
  }
}

export function stripeRuntimeMode(): StripeKeyMode {
  return stripeKeyModeFromSecretKey(process.env.STRIPE_SECRET_KEY) ?? 'live';
}
