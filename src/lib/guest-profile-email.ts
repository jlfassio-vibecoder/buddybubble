/**
 * Neutral copy when an anonymous guest cannot attach an email to their session.
 * Intentionally does **not** confirm whether the address is already registered
 * (aligns with login anti-enumeration).
 */
export const GUEST_EMAIL_UNAVAILABLE_MSG =
  "We couldn't attach that email to this guest session. Sign out and sign in with your account, or try a different email.";

/** GoTrue often returns a vague message when the email is already taken. */
export const GUEST_EMAIL_AUTH_UPDATE_FAILURE_RE =
  /error updating user|already.*(registered|exists|been)/i;

export function mapGuestEmailAuthUpdateError(message: string): string {
  if (GUEST_EMAIL_AUTH_UPDATE_FAILURE_RE.test(message)) {
    return GUEST_EMAIL_UNAVAILABLE_MSG;
  }
  return message;
}
