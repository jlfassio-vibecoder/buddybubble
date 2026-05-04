import { Resend } from 'resend';

/**
 * Sends a recovery / set-password link when `resetPasswordForEmail` is unavailable
 * and we fall back to `admin.generateLink({ type: 'recovery' })`.
 */
export async function sendAccountRecoveryLoginEmail(opts: {
  to: string;
  recoveryLinkUrl: string;
}): Promise<{ error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { error: 'RESEND_API_KEY is not configured.' };
  }
  const from = process.env.RESEND_FROM?.trim();
  if (!from) {
    return { error: 'RESEND_FROM is not configured.' };
  }

  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject: 'Set your BuddyBubble password',
    text: [
      'Use this secure link to verify your account and set a password:',
      '',
      opts.recoveryLinkUrl,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
  });

  if (error) {
    return {
      error:
        typeof error === 'object' && error && 'message' in error
          ? String((error as { message: string }).message)
          : 'Email send failed.',
    };
  }
  return {};
}
