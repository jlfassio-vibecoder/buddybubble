'use client';

import { useActionState } from 'react';
import { joinViaInviteAction, type InviteJoinState } from './actions';
import { Button } from '@/components/ui/button';
import { formatUserFacingError } from '@/lib/format-error';

const initial: InviteJoinState = { error: null };

export function InviteJoinForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(joinViaInviteAction, initial);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formatUserFacingError(state.error)}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Joining…' : 'Continue with this invite'}
      </Button>
    </form>
  );
}
