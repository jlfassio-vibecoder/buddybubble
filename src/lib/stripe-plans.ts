/**
 * Browser-safe Stripe plan catalog.
 *
 * This file contains ONLY plain data — no Node.js SDK imports.
 * Import from here in Client Components and shared utilities.
 *
 * Server-side API routes should import from `@/lib/stripe` which
 * re-exports everything here alongside the Stripe Node SDK singleton.
 */

export const STRIPE_PLANS = {
  athlete: {
    productId: 'prod_UDhTcM2fPV6Q5a',
    defaultPriceId: 'price_1TFG4fLa1RgN4xxgYyHMfH7V',
    name: 'Athlete',
    description: 'Solo personal performance tracking with AI HIIT workouts.',
    maxMembers: 1 as number | null,
  },
  host: {
    productId: 'prod_UE6nvKBLLeH6k6',
    defaultPriceId: 'price_1TFeZnLa1RgN4xxgA6CaoIsb',
    name: 'Host',
    description: 'Community host — all Athlete features + up to 5 members.',
    maxMembers: 5 as number | null,
  },
  pro: {
    productId: 'prod_UE6qKGg6mDMj9B',
    defaultPriceId: 'price_1TFecfLa1RgN4xxgcX0y92bk',
    name: 'Pro',
    description: 'Coaching business — AI programming + 360° health insights for 30+ clients.',
    maxMembers: 30 as number | null,
  },
  studio: {
    productId: 'prod_UE6sc9yLpUp0Me',
    defaultPriceId: 'price_1TFeeYLa1RgN4xxgjYY0MmVN',
    name: 'Studio',
    description: 'Boutique studio — multi-trainer management + location analytics.',
    maxMembers: null as number | null,
  },
  coach_pro: {
    productId: 'prod_UE6uvLSsz3mxKo',
    defaultPriceId: 'price_1TFeh5La1RgN4xxg0hdVWysF',
    name: 'Coach Pro',
    description: 'Large coaching operation — 200+ clients, full analytics suite.',
    maxMembers: 200 as number | null,
  },
  studio_pro: {
    productId: 'prod_UEPent0XbfaD7J',
    defaultPriceId: 'price_1TFwp8La1RgN4xxgSQ0n1DaM',
    name: 'Studio Pro',
    description: 'Multi-studio enterprise — unlimited engagement tools.',
    maxMembers: null as number | null,
  },
} as const;

export type StripePlanKey = keyof typeof STRIPE_PLANS;

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
