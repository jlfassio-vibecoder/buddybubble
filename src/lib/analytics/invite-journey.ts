/**
 * Invite / QR funnel — one `analytics_events` row per step (`event_type: invite_journey_step`).
 * `metadata.step` is the machine key; owners see `INVITE_JOURNEY_STEP_LABELS`.
 */

export const INVITE_JOURNEY_STEPS = [
  'invite_created',
  'invite_preview_rpc_error',
  'invite_preview_invalid',
  'invite_landing_shown',
  'invite_auth_google_clicked',
  'invite_auth_email_link_clicked',
  'invite_join_submit',
  'invite_join_joined_workspace',
  'invite_join_pending_approval',
  'invite_join_failed',
  'invite_qr_anonymous_started',
  'invite_qr_anonymous_failed',
  'invite_qr_join_succeeded',
  'auth_callback_invite_handoff_saved',
  'onboarding_no_user_redirect_login',
  'onboarding_consume_started',
  'onboarding_consume_joined_workspace',
  'onboarding_consume_pending_approval',
  'onboarding_consume_failed',
  'login_with_invite_token_opened',
  'invite_handoff_cookie_saved',
  'login_magic_link_session_resolved',
  'profile_completion_modal_shown',
  'profile_completion_modal_completed',
] as const;

export type InviteJourneyStep = (typeof INVITE_JOURNEY_STEPS)[number];

/** Steps emitted from the authenticated dashboard profile-completion gate (no invite token). */
export type ProfileCompletionInviteJourneyStep = Extract<
  InviteJourneyStep,
  'profile_completion_modal_shown' | 'profile_completion_modal_completed'
>;

export const INVITE_JOURNEY_STEP_LABELS: Record<InviteJourneyStep, string> = {
  invite_created: 'Invite created (QR / link / email / SMS)',
  invite_preview_rpc_error: 'Invite page: could not load preview (server error)',
  invite_preview_invalid: 'Invite page: link invalid, expired, revoked, or used up',
  invite_landing_shown: 'Invite page: valid link opened',
  invite_auth_google_clicked: 'Invite page: Continue with Google',
  invite_auth_email_link_clicked: 'Invite page: Sign in with email (goes to login)',
  invite_join_submit: 'Signed-in guest: submitted “Continue with this invite”',
  invite_join_joined_workspace: 'Joined workspace from invite page',
  invite_join_pending_approval: 'Request pending approval (from invite page)',
  invite_join_failed: 'Join from invite page failed',
  invite_qr_anonymous_started: 'QR invite: guest instant join started (anonymous sign-in)',
  invite_qr_anonymous_failed: 'QR invite: anonymous sign-in failed',
  invite_qr_join_succeeded: 'QR invite: joined workspace after anonymous sign-in',
  auth_callback_invite_handoff_saved: 'After OAuth/email link: invite saved to browser (callback)',
  onboarding_no_user_redirect_login:
    'Onboarding: not signed in — sent to login (invite cookie may exist)',
  onboarding_consume_started: 'Onboarding: finishing invite (auto)',
  onboarding_consume_joined_workspace: 'Onboarding: joined workspace from invite',
  onboarding_consume_pending_approval: 'Onboarding: pending approval after invite',
  onboarding_consume_failed: 'Onboarding: could not complete invite',
  login_with_invite_token_opened: 'Login opened with invite in URL (email path)',
  invite_handoff_cookie_saved: 'Login: invite handoff saved to secure cookie',
  login_magic_link_session_resolved:
    'Login: session established (e.g. email link); shows where they were sent',
  profile_completion_modal_shown:
    'Dashboard: profile completion modal shown (name/email/password gate)',
  profile_completion_modal_completed:
    'Dashboard: profile completion saved (email, password, profile fields)',
};
