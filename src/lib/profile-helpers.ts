import type { WorkspaceMemberOnboardingStatus } from '@/lib/leads-source';
import type { Database } from '@/types/database';

type UserProfileRow = Database['public']['Tables']['users']['Row'];

/**
 * Minimal workspace fields used by the dashboard profile-completion gate.
 * Matches the subset of `WorkspaceRow` read from `useWorkspaceStore().activeWorkspace`.
 */
export type ProfileCompletionGateWorkspace = {
  id: string;
  role: 'admin' | 'member' | 'guest';
  onboarding_status: WorkspaceMemberOnboardingStatus;
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
 * 3. Everyone else needs a non-empty display name and email on `public.users` (anonymous
 *    invitees set both in the completion modal).
 */
export function isDashboardProfileComplete(
  profile: UserProfileRow | null,
  activeWorkspace: ProfileCompletionGateWorkspace,
  currentWorkspaceId: string,
): boolean {
  if (!profile) return true;

  const isTrialGuestInActiveWorkspace =
    activeWorkspace?.id === currentWorkspaceId &&
    activeWorkspace.role === 'guest' &&
    activeWorkspace.onboarding_status === 'trial_active';

  if (isTrialGuestInActiveWorkspace) return true;

  return Boolean(profile.full_name?.trim()) && Boolean(profile.email?.trim());
}
