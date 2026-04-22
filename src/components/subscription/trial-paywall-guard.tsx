'use client';

/**
 * Soft-lock overlay for storefront guests after member preview ends (workspace_members).
 * Chat / lobby stay usable; this wraps Kanban + embedded calendar rail only.
 *
 * CTA opens the existing workspace billing modal (BuddyBubble Athlete/Host plans), not B2B2C.
 */

import { useSubscriptionStore } from '@/store/subscriptionStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Props = {
  locked: boolean;
  children: React.ReactNode;
  className?: string;
};

export function TrialPaywallGuard({ locked, children, className }: Props) {
  const openTrialModal = useSubscriptionStore((s) => s.openTrialModal);
  /** Mirrors parent decision (`shouldSoftLockTrialSurfaces` → member preview ended). */
  const isExpired = locked;
  console.log('[DEBUG] [PaywallGuard] Evaluating user access. Expired:', isExpired);

  if (!locked) {
    return <div className={cn('min-h-0 min-w-0 flex-1', className)}>{children}</div>;
  }

  return (
    <div className={cn('relative min-h-0 min-w-0 flex-1 overflow-hidden', className)}>
      <div className="pointer-events-none min-h-0 flex-1 select-none opacity-[0.35] blur-[1px]">
        {children}
      </div>
      <div
        className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/85 p-6 text-center backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-trial-paywall-title"
      >
        <p
          id="member-trial-paywall-title"
          className="max-w-md text-sm font-semibold text-foreground"
        >
          Your 3-day preview has ended.
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          Subscribe to Athlete or Host on BuddyBubble to keep your custom plan and full access in
          this workspace. (This is your BuddyBubble membership — separate from any future coach
          checkout.)
        </p>
        <Button type="button" onClick={() => openTrialModal()} className="mt-1">
          View plans
        </Button>
      </div>
    </div>
  );
}
