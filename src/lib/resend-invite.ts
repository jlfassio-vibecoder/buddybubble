import { Resend } from 'resend';

export async function sendInviteEmail(opts: {
  to: string;
  inviteUrl: string;
  workspaceName?: string;
}): Promise<{ error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return { error: 'RESEND_API_KEY is not configured.' };
  }
  const from = process.env.RESEND_FROM?.trim();
  if (!from) {
    return { error: 'RESEND_FROM is not configured (e.g. onboarding@yourdomain.com).' };
  }

  const resend = new Resend(key);
  const subject = opts.workspaceName
    ? `You're invited to ${opts.workspaceName} on BuddyBubble`
    : `You're invited to BuddyBubble`;

  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject,
    text: `Someone invited you to join a BuddyBubble.\n\nOpen this link to continue:\n${opts.inviteUrl}\n\nIf you didn't expect this, you can ignore this email.`,
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
