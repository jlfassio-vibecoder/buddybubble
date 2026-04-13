/**
 * Test-mode Stripe catalog from STRIPE_TEST_CATALOG_JSON (+ optional overlay).
 *
 * Create matching recurring prices in Stripe **test mode** (Dashboard test-data toggle
 * or `stripe login` + test key), then paste JSON into .env.local.
 *
 * Use **STRIPE_TEST_CATALOG_JSON_OVERLAY** to merge in more plans (e.g. add business plans
 * after fitness plans) without editing one huge line.
 *
 * **Sandbox convenience:** if only `athlete` and/or `host` are defined, any other plan keys
 * (pro, studio, coach_pro, studio_pro) are auto-filled to reuse the same Stripe price as
 * `host` when host is valid, otherwise `athlete`. You need at least one complete tier.
 */

import type { StripePlanKey } from '@/lib/stripe-plans';
import { STRIPE_PLAN_KEYS } from '@/lib/stripe-plans';

export type StripePlanStripeIds = { productId: string; defaultPriceId: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parsePlanEntry(key: StripePlanKey, raw: unknown): StripePlanStripeIds {
  if (!isRecord(raw)) {
    throw new Error(
      `Stripe test catalog: "${key}" must be an object with productId and defaultPriceId.`,
    );
  }
  const productId = raw.productId;
  const defaultPriceId = raw.defaultPriceId;
  if (typeof productId !== 'string' || !productId.startsWith('prod_')) {
    throw new Error(
      `Stripe test catalog: "${key}.productId" must be a Stripe product id (prod_…).`,
    );
  }
  if (typeof defaultPriceId !== 'string' || !defaultPriceId.startsWith('price_')) {
    throw new Error(
      `Stripe test catalog: "${key}.defaultPriceId" must be a Stripe price id (price_…).`,
    );
  }
  return { productId, defaultPriceId };
}

function parseJsonObject(envName: string, raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${envName} must be valid JSON.`);
  }
  if (!isRecord(parsed)) {
    throw new Error(`${envName} must be a JSON object at the root.`);
  }
  return parsed;
}

/** Per-plan merge: overlay fields win over base. */
function mergePlanLayer(
  base: Record<string, unknown> | undefined,
  overlay: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !overlay) return undefined;
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

function hasCompleteStripeIds(layer: Record<string, unknown> | undefined): boolean {
  if (!layer) return false;
  const productId = layer.productId;
  const defaultPriceId = layer.defaultPriceId;
  return (
    typeof productId === 'string' &&
    productId.startsWith('prod_') &&
    typeof defaultPriceId === 'string' &&
    defaultPriceId.startsWith('price_')
  );
}

/**
 * Parses STRIPE_TEST_CATALOG_JSON and optional STRIPE_TEST_CATALOG_JSON_OVERLAY.
 * Missing plan keys are filled from **host** (preferred) or **athlete** so sandbox can
 * ship with only those two Stripe products while business routes still resolve prices.
 */

// Copilot suggestion ignored: Dedicated Vitest cases for merge/overlay/fill were deferred; exercise changes via `docs/stripe-test-catalog-sandbox-fitness.example.json` and local env.
export function parseTestStripeCatalogFromEnv(): Record<StripePlanKey, StripePlanStripeIds> {
  const jsonA = process.env.STRIPE_TEST_CATALOG_JSON;
  const jsonB = process.env.STRIPE_TEST_CATALOG_JSON_OVERLAY;

  if (!jsonA?.trim() && !jsonB?.trim()) {
    throw new Error(
      'Stripe is in test mode (sk_test_) but neither STRIPE_TEST_CATALOG_JSON nor ' +
        'STRIPE_TEST_CATALOG_JSON_OVERLAY is set. In Dashboard with **View test data** on, ' +
        'create at least **athlete** and/or **host** products in test mode, set STRIPE_TEST_CATALOG_JSON, ' +
        'and omit business plans if you like — missing keys reuse host (else athlete) Stripe prices. ' +
        'Split across STRIPE_TEST_CATALOG_JSON + STRIPE_TEST_CATALOG_JSON_OVERLAY if needed. ' +
        'See docs/stripe-test-catalog-sandbox-fitness.example.json.',
    );
  }

  const layerA = parseJsonObject('STRIPE_TEST_CATALOG_JSON', jsonA);
  const layerB = parseJsonObject('STRIPE_TEST_CATALOG_JSON_OVERLAY', jsonB);

  const mergedLayers = {} as Record<string, Record<string, unknown> | undefined>;
  for (const key of STRIPE_PLAN_KEYS) {
    const a = isRecord(layerA[key]) ? (layerA[key] as Record<string, unknown>) : undefined;
    const b = isRecord(layerB[key]) ? (layerB[key] as Record<string, unknown>) : undefined;
    mergedLayers[key] = mergePlanLayer(a, b);
  }

  const hostIds = mergedLayers.host;
  const athleteIds = mergedLayers.athlete;
  const fillSource = hasCompleteStripeIds(hostIds)
    ? hostIds!
    : hasCompleteStripeIds(athleteIds)
      ? athleteIds!
      : null;

  if (!fillSource) {
    throw new Error(
      'Stripe test catalog must define at least **host** or **athlete** with both productId and defaultPriceId.',
    );
  }

  for (const key of STRIPE_PLAN_KEYS) {
    if (!hasCompleteStripeIds(mergedLayers[key])) {
      mergedLayers[key] = {
        productId: fillSource.productId,
        defaultPriceId: fillSource.defaultPriceId,
      };
    }
  }

  const out = {} as Record<StripePlanKey, StripePlanStripeIds>;
  for (const key of STRIPE_PLAN_KEYS) {
    out[key] = parsePlanEntry(key, mergedLayers[key]);
  }
  return out;
}
