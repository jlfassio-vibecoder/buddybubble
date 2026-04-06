'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown when `accept_invitation` returned `pending` (waiting-room flow).
 * Invitees are authenticated but not yet workspace members.
 */
export function InvitePendingPanel() {
  const router = useRouter();

  return (
    <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="flex justify-center">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          </div>
        </div>
      </div>
      <div>
        <h1 className="text-lg font-semibold text-foreground">Waiting for host approval</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You&apos;re signed in, but a host still needs to approve you before you can open this
          BuddyBubble. You can leave this page open — we&apos;ll move you along automatically once
          you&apos;re in.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button type="button" variant="secondary" onClick={() => router.refresh()}>
          Check status
        </Button>
      </div>
      <div className="border-t border-border pt-6">
        <p className="text-xs text-muted-foreground">
          Want your own space instead?{' '}
          <Link
            href="/onboarding"
            className="font-medium text-primary underline underline-offset-4"
          >
            Start your own BuddyBubble
          </Link>
        </p>
      </div>
    </div>
  );
}
