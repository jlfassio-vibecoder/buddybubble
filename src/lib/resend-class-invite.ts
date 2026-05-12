import { Resend } from 'resend';

export async function sendClassInviteEmail(opts: {
  to: string;
  classUrl: string;
  workspaceName?: string;
  recipientName?: string;
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
    ? `Your class link for ${opts.workspaceName}`
    : `Your class link`;
  const greeting = opts.recipientName ? `Hi ${opts.recipientName},` : 'Hi,';
  const body = `${greeting}

Your class is ready. Open this link to jump straight to the pre-huddle screen:

${opts.classUrl}

See you in there.`;

  const { error } = await resend.emails.send({
    from,
    to: opts.to,
    subject,
    text: body,
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
