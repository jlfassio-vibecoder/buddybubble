import type { WorkspaceMemberOnboardingStatus } from '@/lib/leads-source';
import type { Database, WorkspaceCategory } from '@/types/database';

type UserProfileRow = Database['public']['Tables']['users']['Row'];

/**
 * Minimal workspace fields used by the dashboard profile-completion gate.
 * Matches the subset of `WorkspaceRow` read from `useWorkspaceStore().activeWorkspace`.
 */
export type ProfileCompletionGateWorkspace = {
  id: string;
  role: 'admin' | 'member' | 'guest' | 'trialing';
  onboarding_status: WorkspaceMemberOnboardingStatus;
  /** When set, enables fitness-specific bypass (e.g. storefront trial + TaskModal handoff). */
  category_type?: WorkspaceCategory;
} | null;

/**
 * Whether the dashboard should treat the signed-in user as "profile complete" and hide
 * {@link ProfileCompletionModal}.
 *
 * Rules (single source of truth — keep in sync with product policy):
 * 1. **No profile row yet** (`null`, e.g. still loading from `loadProfile`) → treat as complete
 *    for this gate so we never imply "show {@link ProfileCompletionModal}" without a row;
 *    the shell still only mounts the modal when `profile !== null`.
 * 2. Storefront trial guests in the active route workspace bypass the gate so the trial
 *    surface loads immediately.
 * 2b. **Fitness** storefront trial with `trialing` + `trial_active` also bypasses so
 *     ProfileCompletionModal does not stack over the first-visit WorkoutViewer handoff.
 * 3. Everyone else needs a non-empty **display name** on `public.users`.
 * 4. **Email on `public.users`** is required **unless** the session already has an email
 *    (`authHasSessionEmail === true`) — avoids locking **legacy** accounts that have a name
 *    but an empty `public.users.email` while `auth.users` already carries an address (OAuth drift).
 *    `authHasSessionEmail === null` means “still resolving”; treat like unknown so we do not flash
 *    the gate on first paint. `false` means no session email → gate stays on until the modal
 *    collects email (e.g. anonymous QR invitees).
 */
// Copilot suggestion ignored: Dedicated Vitest unit tests for this helper were deferred to keep the change set minimal.
export function isDashboardProfileComplete(
  profile: UserProfileRow | null,
  activeWorkspace: ProfileCompletionGateWorkspace,
  currentWorkspaceId: string,
  authHasSessionEmail: boolean | null = null,
): boolean {
  if (!profile) return true;

  const isTrialGuestInActiveWorkspace =
    activeWorkspace?.id === currentWorkspaceId &&
    activeWorkspace.role === 'guest' &&
    activeWorkspace.onboarding_status === 'trial_active';

  if (isTrialGuestInActiveWorkspace) return true;

  const isFitnessStorefrontTrialingInActiveWorkspace =
    activeWorkspace?.id === currentWorkspaceId &&
    activeWorkspace.role === 'trialing' &&
    activeWorkspace.onboarding_status === 'trial_active' &&
    activeWorkspace.category_type === 'fitness';

  if (isFitnessStorefrontTrialingInActiveWorkspace) return true;

  const hasName = Boolean(profile.full_name?.trim());
  if (!hasName) return false;

  const hasPublicEmail = Boolean(profile.email?.trim());
  if (hasPublicEmail) return true;

  if (authHasSessionEmail === true) return true;
  if (authHasSessionEmail === null) return true;

  return false;
}

/** `users.children_names` is stored as JSON; coerce for React state. */
export function childrenNamesFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === 'string');
}
