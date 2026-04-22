/**
 * UTM + click-id parsing and source computation for the storefront intake.
 *
 * Source rules (match `lead-onboarding-workflow.md` and the legacy inline logic):
 *   - `storefront_paid` if `utm_medium` is cpc|cpm|paid|ppc|paidsearch|display
 *     OR any of gclid|fbclid|msclkid is present in the query string.
 *   - `storefront_organic` otherwise.
 *
 * Kept as a pure function so `PhaseEmail` / `StorefrontHero` stay testable.
 */

const PAID_MEDIUMS = new Set(['cpc', 'cpm', 'paid', 'ppc', 'paidsearch', 'display']);

const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'msclkid',
];

/**
 * Parse a query-string (e.g. `window.location.search`) into `{ source, utmParams }`.
 */
export function parseAttribution(search) {
  const sp = new URLSearchParams(search || '');
  const utmParams = {};
  for (const k of UTM_KEYS) {
    const v = sp.get(k);
    if (v) utmParams[k] = v;
  }
  const medium = (sp.get('utm_medium') || '').toLowerCase();
  const hasClickId = Boolean(sp.get('gclid') || sp.get('fbclid') || sp.get('msclkid'));
  const source = PAID_MEDIUMS.has(medium) || hasClickId ? 'storefront_paid' : 'storefront_organic';
  return { source, utmParams };
}

export function getCurrentAttribution() {
  if (typeof window === 'undefined') {
    return { source: 'storefront_organic', utmParams: {} };
  }
  return parseAttribution(window.location.search);
}
