'use client';

import { useActionState, useRef, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/lib/format-error';
import { reportInviteJourneyClient } from '@/lib/analytics/invite-journey-client';
import { joinViaInviteAction, type InviteJoinState } from './actions';

const initial: InviteJoinState = { error: null };

type Props = {
  token: string;
  requiresApproval: boolean;
};

export function InviteQrInstantAuth({ token, requiresApproval }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, joinPending] = useActionState(joinViaInviteAction, initial);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleInstantJoin() {
    setLocalError(null);
    reportInviteJourneyClient(token, 'invite_qr_anonymous_started');
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setBusy(false);
      reportInviteJourneyClient(token, 'invite_qr_anonymous_failed', {
        code: error.code ?? 'unknown',
      });
      setLocalError(formatUserFacingError(error));
      return;
    }
    setBusy(false);
    formRef.current?.requestSubmit();
  }

  const displayError = localError ?? state?.error;
  const pending = busy || joinPending;

  return (
    <div className="space-y-3">
      {displayError ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formatUserFacingError(displayError)}
        </p>
      ) : null}
      <form ref={formRef} action={formAction}>
        <input type="hidden" name="token" value={token} />
      </form>
      <Button
        type="button"
        className="w-full shadow-sm"
        onClick={() => void handleInstantJoin()}
        disabled={pending}
      >
        {pending
          ? 'Joining…'
          : requiresApproval
            ? 'Continue as guest (request access)'
            : 'Join instantly as a guest'}
      </Button>
      <p className="text-center text-[11px] text-muted-foreground">
        {requiresApproval
          ? 'Creates a guest account so a host can approve you. No email needed for this step.'
          : 'No email for this step — you can add Google or a password after you enter.'}
      </p>
    </div>
  );
}
