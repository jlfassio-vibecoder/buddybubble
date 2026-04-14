/**
 * Lead `source` values for `public.leads` and workspace lead analytics.
 * Invite channels vs storefront soft-trial (see docs/tdd-lead-onboarding.md).
 */

export type InviteLeadSource = 'qr' | 'link' | 'email' | 'sms' | 'direct';

export type StorefrontLeadSource = 'storefront_organic' | 'storefront_paid';

/** Union stored in `public.leads.source` after migration `20260520120000_storefront_lead_phase1`. */
export type LeadRowSource = InviteLeadSource | StorefrontLeadSource;

const STOREFRONT_SET = new Set<string>(['storefront_organic', 'storefront_paid']);

export function isStorefrontLeadSource(value: string): value is StorefrontLeadSource {
  return STOREFRONT_SET.has(value);
}

export function isInviteLeadSource(value: string): value is InviteLeadSource {
  return (
    value === 'qr' || value === 'link' || value === 'email' || value === 'sms' || value === 'direct'
  );
}

export type BubbleType = 'standard' | 'trial' | 'dm';

export type WorkspaceMemberOnboardingStatus = 'completed' | 'trial_active' | 'trial_expired';
