/**
 * Live-mode Stripe product + default price IDs (production catalog).
 * Keep in sync with Stripe Dashboard (live) when prices change.
 */

import type { StripePlanKey } from '@/lib/stripe-plans';

export const STRIPE_PLAN_IDS_LIVE: Record<
  StripePlanKey,
  { productId: string; defaultPriceId: string }
> = {
  athlete: {
    productId: 'prod_UDhTcM2fPV6Q5a',
    defaultPriceId: 'price_1TFG4fLa1RgN4xxgYyHMfH7V',
  },
  host: {
    productId: 'prod_UE6nvKBLLeH6k6',
    defaultPriceId: 'price_1TFeZnLa1RgN4xxgA6CaoIsb',
  },
  pro: {
    productId: 'prod_UE6qKGg6mDMj9B',
    defaultPriceId: 'price_1TFecfLa1RgN4xxgcX0y92bk',
  },
  studio: {
    productId: 'prod_UE6sc9yLpUp0Me',
    defaultPriceId: 'price_1TFeeYLa1RgN4xxgjYY0MmVN',
  },
  coach_pro: {
    productId: 'prod_UE6uvLSsz3mxKo',
    defaultPriceId: 'price_1TFeh5La1RgN4xxg0hdVWysF',
  },
  studio_pro: {
    productId: 'prod_UEPent0XbfaD7J',
    defaultPriceId: 'price_1TFwp8La1RgN4xxgSQ0n1DaM',
  },
};
