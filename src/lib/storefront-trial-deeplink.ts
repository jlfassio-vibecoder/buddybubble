/**
 * Storefront trial magic-link path: shared between CRM intake and dashboard client.
 * `viewer=workout` triggers async-resilient auto-open of the trial workout in TaskModal.
 */
export const STOREFRONT_TRIAL_VIEWER_QUERY = 'viewer' as const;
export const STOREFRONT_TRIAL_VIEWER_WORKOUT = 'workout' as const;

/**
 * App Router path for post-auth landing; `categoryType` fitness appends the workout viewer flag.
 */
export function buildStorefrontTrialAppPath(
  workspaceId: string,
  trialBubbleId: string,
  categoryType: string,
): string {
  const q = new URLSearchParams();
  q.set('bubble', trialBubbleId);
  if (categoryType === 'fitness') {
    q.set(STOREFRONT_TRIAL_VIEWER_QUERY, STOREFRONT_TRIAL_VIEWER_WORKOUT);
  }
  return `/app/${workspaceId}?${q.toString()}`;
}
