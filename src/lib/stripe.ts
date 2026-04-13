/**
 * Stripe server-side client and plan catalog.
 *
 * Plan rows merge browser-safe metadata from `stripe-plans.ts` with mode-specific
 * product/price IDs (live: `stripe-plan-ids-live.ts`, test: STRIPE_TEST_CATALOG_JSON).
 *
 * IMPORTANT: import this file only in server-side code (API routes,
 * server actions, webhook handler). Never import in Client Components.
 */

import Stripe from 'stripe';
import { STRIPE_PLAN_META, type StripePlanKey } from '@/lib/stripe-plans';
import { STRIPE_PLAN_IDS_LIVE } from '@/lib/stripe-plan-ids-live';
import { parseTestStripeCatalogFromEnv } from '@/lib/stripe-test-catalog';
import { assertStripeEnvironment, stripeRuntimeMode } from '@/lib/stripe-runtime';

// Re-export for server routes that only need types / helpers from shared modules
export type { StripePlanKey } from '@/lib/stripe-plans';
export { TRIAL_PERIOD_DAYS } from '@/lib/stripe-plans';

export type StripePlanRow = (typeof STRIPE_PLAN_META)[StripePlanKey] & {
  productId: string;
  defaultPriceId: string;
};

export type StripePlansMap = Record<StripePlanKey, StripePlanRow>;

// ── Singleton client ──────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;
let _stripeEnvChecked = false;

export function getStripe(): Stripe {
  if (!_stripeEnvChecked) {
    assertStripeEnvironment();
    _stripeEnvChecked = true;
  }
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Missing STRIPE_SECRET_KEY environment variable');
    _stripe = new Stripe(key, { apiVersion: '2026-03-25.dahlia' });
  }
  return _stripe;
}

// ── Plan catalog (test vs live) ───────────────────────────────────────────────

let _stripePlansCache: StripePlansMap | null = null;

function buildStripePlansMap(): StripePlansMap {
  const mode = stripeRuntimeMode();
  const ids = mode === 'live' ? STRIPE_PLAN_IDS_LIVE : parseTestStripeCatalogFromEnv();
  const keys = Object.keys(STRIPE_PLAN_META) as StripePlanKey[];
  const out = {} as StripePlansMap;
  for (const key of keys) {
    const meta = STRIPE_PLAN_META[key];
    const id = ids[key];
    out[key] = {
      ...meta,
      productId: id.productId,
      defaultPriceId: id.defaultPriceId,
    };
  }
  return out;
}

/** Full plan catalog for the current Stripe key mode (cached per process). */
export function getStripePlans(): StripePlansMap {
  if (!_stripePlansCache) {
    _stripePlansCache = buildStripePlansMap();
  }
  return _stripePlansCache;
}

/**
 * Recurring price used for display + new subscriptions: Stripe Product **default price**
 * when it is an active recurring price; otherwise the catalog `defaultPriceId`.
 * Keeps amounts aligned with Dashboard when the default price is updated there.
 */
export async function retrieveEffectivePlanPrice(
  stripe: Stripe,
  productId: string,
  catalogDefaultPriceId: string,
): Promise<Stripe.Price> {
  try {
    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    });
    const dp = product.default_price;
    if (typeof dp === 'object' && dp !== null && !('deleted' in dp && dp.deleted)) {
      const price = dp as Stripe.Price;
      if (price.active && price.recurring) {
        if (price.id !== catalogDefaultPriceId) {
          console.warn(
            '[stripe] Product default price differs from catalog defaultPriceId; using Dashboard default.',
            { productId, productDefaultPriceId: price.id, catalogDefaultPriceId },
          );
        }
        return price;
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(
      '[stripe] retrieveEffectivePlanPrice: product retrieve failed, using catalog id:',
      {
        productId,
        catalogDefaultPriceId,
        message,
      },
    );
  }

  return stripe.prices.retrieve(catalogDefaultPriceId);
}

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
export function getPlanByPriceId(priceId: string): StripePlanRow | undefined {
  return Object.values(getStripePlans()).find((p) => p.defaultPriceId === priceId);
}

/**
 * Look up a plan by its Stripe product ID.
 */
export function getPlanByProductId(productId: string): StripePlanRow | undefined {
  return Object.values(getStripePlans()).find((p) => p.productId === productId);
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

/**
 * Stale `stripe_customers.stripe_customer_id` values (wrong Stripe account, deleted
 * customer, or dev placeholders) return this from the Stripe API.
 */
export function isStripeResourceMissingError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'resource_missing'
  );
}
