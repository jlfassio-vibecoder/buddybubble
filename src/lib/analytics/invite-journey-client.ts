'use client';

import type { InviteJourneyStep } from '@/lib/analytics/invite-journey';

/**
 * Fire-and-forget: records an invite-funnel step for the workspace tied to `token`.
 * No-op without a plausible token (same rules as cookie / path validation).
 */
export function reportInviteJourneyClient(
  token: string | null | undefined,
  step: InviteJourneyStep,
  detail?: Record<string, unknown>,
): void {
  const t = token?.trim();
  if (!t || typeof window === 'undefined') return;

  void fetch('/api/analytics/invite-step', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: t, step, detail: detail ?? {} }),
  }).catch(() => {});
}
