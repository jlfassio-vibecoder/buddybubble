'use client';

import { useEffect, useRef } from 'react';

const STORAGE_PREFIX = 'buddybubble_lead_id:';

function parseLeadSource(search: string): 'qr' | 'link' | 'email' | 'sms' | 'direct' {
  const params = new URLSearchParams(search);
  const raw = params.get('source')?.trim().toLowerCase();
  if (raw === 'qr' || raw === 'link' || raw === 'email' || raw === 'sms') return raw;
  if (params.get('utm_source') || params.get('utm_medium')) return 'link';
  return 'direct';
}

type Props = {
  workspaceId: string;
  inviteToken: string;
};

/**
 * Records anonymous invite visits for business/fitness lead analytics.
 * Idempotent per tab via localStorage lead id.
 * The API tags each lead with in-person vs online from the invitation type (link/QR vs email/SMS).
 */
export function LeadVisitTracker({ workspaceId, inviteToken }: Props) {
  const ran = useRef(false);

  useEffect(() => {
    if (!workspaceId || ran.current) return;
    ran.current = true;

    const storageKey = STORAGE_PREFIX + workspaceId;
    let existingLeadId: string | undefined;
    try {
      existingLeadId = localStorage.getItem(storageKey) ?? undefined;
    } catch {
      /* private mode */
    }

    const utm: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      for (const k of [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
      ] as const) {
        const v = params.get(k);
        if (v) utm[k] = v;
      }
    }

    const source =
      typeof window !== 'undefined' ? parseLeadSource(window.location.search) : 'direct';

    void fetch('/api/leads/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        inviteToken,
        leadId: existingLeadId,
        source,
        utmParams: utm,
      }),
    })
      .then((r) => r.json() as Promise<{ leadId?: string | null }>)
      .then((data) => {
        if (data?.leadId && typeof data.leadId === 'string') {
          try {
            localStorage.setItem(storageKey, data.leadId);
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
  }, [workspaceId, inviteToken]);

  return null;
}
