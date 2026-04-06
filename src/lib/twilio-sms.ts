import twilio from 'twilio';

export async function sendInviteSms(opts: {
  to: string;
  body: string;
}): Promise<{ error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const messagingSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();

  if (!sid || !token) {
    return { error: 'Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN).' };
  }
  if (!messagingSid && !from) {
    return { error: 'Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER.' };
  }

  const client = twilio(sid, token);
  try {
    await client.messages.create({
      to: opts.to,
      body: opts.body,
      ...(messagingSid ? { messagingServiceSid: messagingSid } : { from: from! }),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'SMS send failed.' };
  }
  return {};
}
