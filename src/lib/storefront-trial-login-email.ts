import { Resend } from 'resend';

/**
 * Delivers the Supabase magic-link URL from `auth.admin.generateLink` — that API does not send mail;
 * we send it here so the link is not exposed in the storefront JSON response (production).
 */
export async function sendStorefrontTrialLoginEmail(opts: {
  to: string;
  magicLinkUrl: string;
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
    subject: 'Continue your BuddyBubble preview',
    text: [
      'You asked to start a BuddyBubble preview.',
      '',
      'Open this one-time link to sign in and open your trial workspace:',
      opts.magicLinkUrl,
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
