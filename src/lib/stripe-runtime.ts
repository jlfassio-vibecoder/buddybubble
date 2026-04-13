/**
 * Stripe key mode and deploy environment helpers (server-only).
 *
 * @see docs/technical-design-stripe-dual-mode-and-billing-funnel-analytics-v1.md
 */

export type StripeKeyMode = 'test' | 'live';

export function stripeKeyModeFromSecretKey(secretKey: string | undefined): StripeKeyMode | null {
  if (!secretKey) return null;
  if (secretKey.startsWith('sk_test_')) return 'test';
  if (secretKey.startsWith('sk_live_')) return 'live';
  return null;
}

export function stripeKeyModeFromPublishableKey(
  publishableKey: string | undefined,
): StripeKeyMode | null {
  if (!publishableKey) return null;
  if (publishableKey.startsWith('pk_test_')) return 'test';
  if (publishableKey.startsWith('pk_live_')) return 'live';
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
  const secret = process.env.STRIPE_SECRET_KEY;
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  const secretMode = stripeKeyModeFromSecretKey(secret);
  if (!secretMode) {
    throw new Error(
      'STRIPE_SECRET_KEY must start with sk_test_ (Stripe test mode) or sk_live_ (live mode).',
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
