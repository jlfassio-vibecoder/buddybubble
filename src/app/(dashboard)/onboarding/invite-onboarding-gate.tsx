'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { consumeInviteOnboarding } from './actions';

export function InviteOnboardingGate() {
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      const result = await consumeInviteOnboarding();
      if (result?.error) {
        setError(result.error);
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="space-y-4 text-center">
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
        <p className="text-sm text-muted-foreground">
          Open your invite link again after fixing the issue, or ask the host for a new invite.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/onboarding"
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            Create a BuddyBubble instead
          </Link>
          <Link href="/" className="text-sm text-muted-foreground underline underline-offset-4">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return <p className="text-center text-sm text-muted-foreground">Completing your invite…</p>;
}
