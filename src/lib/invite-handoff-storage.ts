/** Client-only fallback when the HttpOnly invite cookie is missing after returning from OAuth. */
export const BB_INVITE_HANDOFF_SESSION_KEY = 'bb_invite_handoff_v1';

/** Clear invite handoff backup on logout (sessionStorage is per-tab). */
export function clearInviteHandoffSessionStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(BB_INVITE_HANDOFF_SESSION_KEY);
  } catch {
    /* private mode / quota */
  }
}
