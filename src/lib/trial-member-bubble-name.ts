import type { MemberRole } from '@/types/database';

/** Matches storefront trial bubble naming in `trialBubbleNameFromEmail`. */
export const TRIAL_BUBBLE_NAME_PREFIX = 'Trial · ';

/** Non-redundant level label for workspace guests (not for `member`). */
export const GUEST_BUBBLE_NAME_PREFIX = 'Guest · ';

/** `leads.metadata` key for the private trial bubble id (storefront intake). */
export const STOREFRONT_LEAD_METADATA_TRIAL_BUBBLE_KEY = 'trial_bubble_id';

export function parseTrialBubbleIdFromLeadMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>)[STOREFRONT_LEAD_METADATA_TRIAL_BUBBLE_KEY];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export function stripTrialBubbleNamePrefix(name: string): string {
  if (name.startsWith(TRIAL_BUBBLE_NAME_PREFIX)) {
    return name.slice(TRIAL_BUBBLE_NAME_PREFIX.length);
  }
  return name;
}

function stripGuestBubbleNamePrefix(name: string): string {
  if (name.startsWith(GUEST_BUBBLE_NAME_PREFIX)) {
    return name.slice(GUEST_BUBBLE_NAME_PREFIX.length);
  }
  return name;
}

/**
 * Rewrite a trial 1:1 bubble name after leaving `trialing`.
 * - `member` / `admin` / `owner`: bare handle (never invents "Member ·")
 * - `guest`: single `Guest · ` prefix
 * - `trialing`: leave as-is (caller should not promote with this)
 */
export function memberBubbleDisplayName(input: {
  previousName: string;
  newRole: MemberRole;
}): string {
  const { previousName, newRole } = input;
  const bare = stripGuestBubbleNamePrefix(stripTrialBubbleNamePrefix(previousName)).trim();
  const handle = bare.length > 0 ? bare : previousName.trim();

  if (newRole === 'guest') {
    return `${GUEST_BUBBLE_NAME_PREFIX}${handle}`;
  }

  return handle;
}
