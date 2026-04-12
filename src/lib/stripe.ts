/**
 * Stripe server-side client and plan catalog.
 *
 * All plan/product constants live here so every API route and the
 * webhook handler reference the same source of truth.
 *
 * IMPORTANT: import this file only in server-side code (API routes,
 * server actions, webhook handler). Never import in Client Components.
 */

import Stripe from 'stripe';

// ── Singleton client ──────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY environment variable');
    _stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' });
  }
  return _stripe;
}

// ── Plan catalog ──────────────────────────────────────────────────────────────
// Each entry maps a human-readable plan key → Stripe product + default price.
// Add annual / additional prices here when needed.

export const STRIPE_PLANS = {
  athlete: {
    productId: 'prod_UDhTcM2fPV6Q5a',
    defaultPriceId: 'price_1TFG4fLa1RgN4xxgYyHMfH7V',
    name: 'Athlete',
    description: 'Solo personal performance tracking with AI HIIT workouts.',
    maxMembers: 1,
  },
  host: {
    productId: 'prod_UE6nvKBLLeH6k6',
    defaultPriceId: 'price_1TFeZnLa1RgN4xxgA6CaoIsb',
    name: 'Host',
    description: 'Community host — all Athlete features + up to 5 members.',
    maxMembers: 5,
  },
  pro: {
    productId: 'prod_UE6qKGg6mDMj9B',
    defaultPriceId: 'price_1TFecfLa1RgN4xxgcX0y92bk',
    name: 'Pro',
    description: 'Coaching business — AI programming + 360° health insights for 30+ clients.',
    maxMembers: 30,
  },
  studio: {
    productId: 'prod_UE6sc9yLpUp0Me',
    defaultPriceId: 'price_1TFeeYLa1RgN4xxgjYY0MmVN',
    name: 'Studio',
    description: 'Boutique studio — multi-trainer management + location analytics.',
    maxMembers: null, // unlimited
  },
  coach_pro: {
    productId: 'prod_UE6uvLSsz3mxKo',
    defaultPriceId: 'price_1TFeh5La1RgN4xxg0hdVWysF',
    name: 'Coach Pro',
    description: 'Large coaching operation — 200+ clients, full analytics suite.',
    maxMembers: 200,
  },
  studio_pro: {
    productId: 'prod_UEPent0XbfaD7J',
    defaultPriceId: 'price_1TFwp8La1RgN4xxgSQ0n1DaM',
    name: 'Studio Pro',
    description: 'Multi-studio enterprise — unlimited engagement tools.',
    maxMembers: null, // unlimited
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_PLANS;

/** 3-day reverse trial: card required upfront, auto-charges on day 4 unless cancelled. */
export const TRIAL_PERIOD_DAYS = 3;

// ── Status mapping ────────────────────────────────────────────────────────────

/**
 * Map a Stripe subscription status to our internal `workspace_subscriptions.status`.
 *
 * @param stripeStatus  The status field from the Stripe Subscription object.
 * @param wasTrialing   True when our DB record was 'trialing' before this event
 *                      (used to distinguish trial_expired from plain canceled).
 */
export function mapStripeStatusToInternal(
  stripeStatus: Stripe.Subscription.Status,
  wasTrialing: boolean,
): string {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'past_due';
    case 'canceled':
      return wasTrialing ? 'trial_expired' : 'canceled';
    case 'incomplete':
      return 'incomplete';
    case 'incomplete_expired':
      return 'trial_expired';
    case 'paused':
      return 'canceled';
    default:
      return 'canceled';
  }
}

/**
 * Look up a plan by its Stripe price ID.
 * Returns undefined if the price isn't in our catalog (e.g. grandfathered prices).
 */
export function getPlanByPriceId(
  priceId: string,
): (typeof STRIPE_PLANS)[StripePlanKey] | undefined {
  return Object.values(STRIPE_PLANS).find((p) => p.defaultPriceId === priceId);
}

/**
 * Look up a plan by its Stripe product ID.
 */
export function getPlanByProductId(
  productId: string,
): (typeof STRIPE_PLANS)[StripePlanKey] | undefined {
  return Object.values(STRIPE_PLANS).find((p) => p.productId === productId);
}

/**
 * Billing period bounds for current Stripe API versions: they live on the first
 * subscription item, not on the subscription root.
 */
export function subscriptionPeriodIso(sub: Stripe.Subscription): {
  start: string | null;
  end: string | null;
} {
  const item = sub.items?.data?.[0];
  if (!item) return { start: null, end: null };
  return {
    start:
      item.current_period_start != null
        ? new Date(item.current_period_start * 1000).toISOString()
        : null,
    end:
      item.current_period_end != null
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
  };
}

/**
 * Subscription id for subscription invoices. Current API shapes expose the id on
 * `parent.subscription_details`; older payloads may expose `subscription`.
 */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  if (invoice.parent?.type === 'subscription_details' && invoice.parent.subscription_details) {
    const sub = invoice.parent.subscription_details.subscription;
    return typeof sub === 'string' ? sub : sub.id;
  }
  const legacy = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription })
    .subscription;
  if (!legacy) return null;
  return typeof legacy === 'string' ? legacy : legacy.id;
}
