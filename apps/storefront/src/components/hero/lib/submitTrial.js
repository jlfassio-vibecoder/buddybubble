/**
 * Thin wrapper around the Astro proxy endpoint for the CRM intake.
 *
 * Kept pure / dependency-free so `useSubmitState` (and future tests) can swap it
 * with a stub without any mocking gymnastics.
 *
 * Endpoint: apps/storefront/src/pages/api/storefront-trial.ts
 *   → proxies POST to src/app/api/leads/storefront-trial/route.ts
 *
 * Success response: { ok, workspaceId, leadId, userId, trialBubbleId, next, idempotent? }
 * 409 response:     { error: 'This account is already a member of this workspace.' }
 */
export async function submitTrial(payload, { signal } = {}) {
  const res = await fetch('/api/storefront-trial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const text = await res.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  return { ok: res.ok, status: res.status, data };
}
