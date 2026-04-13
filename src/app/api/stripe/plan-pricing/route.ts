/**
 * GET /api/stripe/plan-pricing
 *
 * Authenticated: returns formatted recurring price labels for every plan key
 * from the current Stripe mode (test vs live). Amounts follow each Product’s
 * **default price** in Stripe when set; otherwise the catalog `defaultPriceId`.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { getStripe, getStripePlans, retrieveEffectivePlanPrice } from '@/lib/stripe';
import type { StripePlanKey } from '@/lib/stripe-plans';
import { STRIPE_PLAN_KEYS } from '@/lib/stripe-plans';

function formatStripePrice(price: {
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string } | null;
}): { formatted: string; unitAmount: number | null; currency: string; interval: string | null } {
  const currency = price.currency;
  const interval = price.recurring?.interval ?? null;

  if (price.unit_amount === null) {
    return {
      formatted: 'Contact sales',
      unitAmount: null,
      currency,
      interval,
    };
  }

  const amount = price.unit_amount / 100;
  const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency });
  const base = fmt.format(amount);

  let formatted = base;
  if (interval === 'month') formatted = `${base}/mo`;
  else if (interval === 'year') formatted = `${base}/yr`;
  else if (interval) formatted = `${base}/${interval}`;

  return {
    formatted,
    unitAmount: price.unit_amount,
    currency,
    interval,
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const stripe = getStripe();
    const plans = getStripePlans();

    const results = await Promise.all(
      STRIPE_PLAN_KEYS.map(async (key) => {
        const { productId, defaultPriceId } = plans[key];
        const price = await retrieveEffectivePlanPrice(stripe, productId, defaultPriceId);
        const { formatted, unitAmount, currency, interval } = formatStripePrice({
          unit_amount: price.unit_amount,
          currency: price.currency,
          recurring: price.recurring,
        });
        return [key, { formatted, unitAmount, currency, interval }] as const;
      }),
    );

    const prices = Object.fromEntries(results) as Record<
      StripePlanKey,
      { formatted: string; unitAmount: number | null; currency: string; interval: string | null }
    >;

    return NextResponse.json(
      { prices },
      {
        headers: {
          'Cache-Control': 'private, max-age=300',
        },
      },
    );
  } catch (e) {
    console.error('[plan-pricing]', e);
    const msg = e instanceof Error ? e.message : 'Failed to load plan pricing';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
