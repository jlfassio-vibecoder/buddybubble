/**
 * Browser-safe Stripe plan metadata (names, copy, member limits).
 *
 * Stripe product/price IDs are **not** here — they differ between test and live mode
 * and are resolved server-side in `@/lib/stripe` via `getStripePlans()`.
 *
 * **listPriceLabel:** Shown in the subscribe plan picker. Keep aligned with each product’s
 * default recurring price in Stripe (USD/mo). New subscriptions and plan-pricing use
 * `retrieveEffectivePlanPrice()` in `@/lib/stripe`: the Product’s active recurring **default
 * price** in Stripe when set, otherwise the catalog `defaultPriceId`. In test mode, if
 * `STRIPE_TEST_CATALOG_JSON` auto-fills business keys from Host, those tiers share Host’s
 * Stripe product until you add real entries per key in `STRIPE_TEST_CATALOG_JSON_OVERLAY`.
 *
 * Server-only price resolution lives in `@/lib/stripe` (`getStripePlans()`, `retrieveEffectivePlanPrice()`);
 * this module stays importable from the browser and must not embed Stripe secret keys or `sk_*` env.
 */

// Copilot suggestion ignored: A `satisfies`-driven plan row type was skipped to avoid churn; `as number | null` keeps literal member caps compatible with `as const` feature tuples.
export const STRIPE_PLAN_META = {
  athlete: {
    name: 'Athlete',
    description: 'Solo personal performance tracking with AI HIIT workouts.',
    maxMembers: 1 as number | null,
    listPriceLabel: '$9.99/mo',
    features: [
      'Personal AI HIIT and workout generation',
      'Task and calendar views for your own training',
      'Mobile-friendly workspace access',
    ] as const,
  },
  host: {
    name: 'Host',
    description: 'Community host — all Athlete features + up to 5 members.',
    maxMembers: 5 as number | null,
    listPriceLabel: '$24.99/mo',
    features: [
      'Everything in Athlete',
      'Invite and manage up to 5 members',
      'Shared bubbles, messaging, and programs',
      'Owner tools for community hosting',
    ] as const,
  },
  pro: {
    name: 'Pro',
    description: 'Coaching business — AI programming + 360° health insights for 30+ clients.',
    maxMembers: 30 as number | null,
    listPriceLabel: '$49.99/mo',
    features: [
      'AI programming and health-oriented insights',
      'Client management for growing coaching practices',
      'Analytics and reporting for your pipeline',
      'Branded experience for clients (where enabled)',
    ] as const,
  },
  studio: {
    name: 'Studio',
    description: 'Boutique studio — multi-trainer management + location analytics.',
    maxMembers: null as number | null,
    listPriceLabel: '$199.99/mo',
    features: [
      'Multi-trainer roles and scheduling',
      'Location- and class-oriented analytics',
      'Studio-wide programs and member journeys',
      'Priority feature access for boutique operators',
    ] as const,
  },
  coach_pro: {
    name: 'Coach Pro',
    description: 'Large coaching operation — 200+ clients, full analytics suite.',
    maxMembers: 200 as number | null,
    listPriceLabel: '$199.99/mo',
    features: [
      'High member caps for large coaching teams',
      'Full analytics and export-oriented workflows',
      'Advanced AI and automation where available',
      'Operational tooling for multi-coach orgs',
    ] as const,
  },
  studio_pro: {
    name: 'Studio Pro',
    description: 'Multi-studio enterprise — unlimited engagement tools.',
    maxMembers: null as number | null,
    listPriceLabel: '$299.99/mo',
    features: [
      'Multi-location and enterprise-ready limits',
      'Advanced engagement and retention tooling',
      'Dedicated analytics across studios',
      'White-glove configuration options (where offered)',
    ] as const,
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_PLAN_META;

export const STRIPE_PLAN_KEYS = Object.keys(STRIPE_PLAN_META) as StripePlanKey[];

/** @deprecated Use STRIPE_PLAN_META — kept for gradual migration of imports */
export const STRIPE_PLANS = STRIPE_PLAN_META;

/** 3-day reverse trial: card required upfront, auto-charges on day 4 unless cancelled. */
export const TRIAL_PERIOD_DAYS = 3;

export const FITNESS_PLAN_KEYS: StripePlanKey[] = ['athlete', 'host'];
export const BUSINESS_PLAN_KEYS: StripePlanKey[] = ['pro', 'studio', 'coach_pro', 'studio_pro'];

/** Returns plan keys available for the given workspace category. */
export function plansForCategory(categoryType: string): StripePlanKey[] {
  if (categoryType === 'fitness') return FITNESS_PLAN_KEYS;
  if (categoryType === 'business') return BUSINESS_PLAN_KEYS;
  return [];
}
