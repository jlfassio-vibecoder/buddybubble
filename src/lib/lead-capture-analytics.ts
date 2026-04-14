/**
 * Workspace lead capture analytics.
 *
 * This module is the home for WORKSPACE lead tracking helpers — i.e. analytics
 * for invitees (invite link or storefront soft-trial) attributed to a workspace.
 *
 * It is NOT used for platform (BuddyBubble subscription) lead tracking.
 * Platform funnel events live in `billing_funnel_events` and the
 * `trial_started` / `trial_converted` analytics event types.
 *
 * @see docs/technical-design-dual-lead-capture-workflows-v1.md
 */

import { trackServerEvent } from '@/lib/analytics/server';
import type { LeadRowSource } from '@/lib/leads-source';

export type { InviteLeadSource, LeadRowSource, StorefrontLeadSource } from '@/lib/leads-source';

/**
 * The acquisition context written into the `lead_captured` analytics event
 * metadata for every new workspace lead row.
 *
 * Stored under `metadata.acquisition_context` so downstream queries can
 * filter or segment by source and UTM without scanning the `leads` table.
 */
export interface AcquisitionContext {
  /** Always 'workspace' — tenant-attributed visitor, not a platform prospect. */
  workflow: 'workspace';
  source: LeadRowSource;
  invite_token: string | null;
  utm_params: Record<string, string>;
}

/**
 * Emit a `lead_captured` analytics event when a new workspace lead row is
 * first inserted by `/api/leads/track` or `/api/leads/storefront-trial`.
 *
 * - Server-side only (called from the service-role API route).
 * - Fire-and-forget: errors are swallowed by `trackServerEvent`; analytics
 *   must never block the response.
 * - Never call this for platform acquisition events (trial_started, etc.).
 */
export async function trackWorkspaceLeadCaptured(opts: {
  workspaceId: string;
  leadId: string;
  source: LeadRowSource;
  inviteToken: string | null;
  utmParams: Record<string, string>;
}): Promise<void> {
  const acquisitionContext: AcquisitionContext = {
    workflow: 'workspace',
    source: opts.source,
    invite_token: opts.inviteToken,
    utm_params: opts.utmParams,
  };

  await trackServerEvent('lead_captured', {
    workspaceId: opts.workspaceId,
    leadId: opts.leadId,
    metadata: {
      workflow: 'workspace',
      source: opts.source,
      invite_token: opts.inviteToken,
      acquisition_context: acquisitionContext,
    },
  });
}
