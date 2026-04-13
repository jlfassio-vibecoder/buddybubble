'use client';

/**
 * ExpiredGate
 *
 * Non-blocking status bar rendered when the workspace subscription is degraded
 * (past_due, trial_expired, canceled, no_subscription, incomplete).
 *
 * Does NOT block workspace content — individual premium features are blocked
 * by PremiumGate. This bar provides context and a CTA to re-subscribe.
 *
 * Rendered once by DashboardShell below the TrialBanner.
 */

import { shouldSubscribeWithoutTrial } from '@/lib/subscription-permissions';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { usePermissions } from '@/hooks/use-permissions';
import { parseMemberRole } from '@/lib/permissions';
import type { MemberRole } from '@/types/database';

function getGateConfig(status: string): {
  label: string;
  variant: 'red' | 'muted';
  showPortal: boolean;
  showSubscribe: boolean;
} {
  switch (status) {
    case 'past_due':
      return {
        label: 'Payment failed — premium features are paused.',
        variant: 'red',
        showPortal: true,
        showSubscribe: false,
      };
    case 'trial_expired':
      return {
        label: 'Your free trial has ended.',
        variant: 'muted',
        showPortal: false,
        showSubscribe: true,
      };
    case 'canceled':
      return {
        label: 'Your subscription has been cancelled.',
        variant: 'muted',
        showPortal: false,
        showSubscribe: true,
      };
    case 'incomplete':
      return {
        label: 'Subscription setup incomplete.',
        variant: 'muted',
        showPortal: true,
        showSubscribe: false,
      };
    default:
      return {
        label: 'Subscribe to unlock premium features.',
        variant: 'muted',
        showPortal: false,
        showSubscribe: true,
      };
  }
}

export function ExpiredGate() {
  const status = useSubscriptionStore((s) => s.status);
  const trialAvailable = useSubscriptionStore((s) => s.trialAvailable);
  const openTrialModal = useSubscriptionStore((s) => s.openTrialModal);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const role = parseMemberRole(
    String((activeWorkspace as { role?: string } | null)?.role ?? 'member'),
  ) as MemberRole;
  const { isOwner } = usePermissions(role);

  const gatedStatuses = ['past_due', 'trial_expired', 'canceled', 'no_subscription', 'incomplete'];
  if (!status || !gatedStatuses.includes(status)) return null;

  const subscribeCta = shouldSubscribeWithoutTrial(trialAvailable, status);

  const config = getGateConfig(status);

  // Copilot suggestion ignored: Follow-up review duplicated the same portal URL hardening (non-empty id + encodeURIComponent) consolidated here.
  const portalWsId =
    typeof activeWorkspace?.id === 'string' && activeWorkspace.id.length > 0
      ? activeWorkspace.id
      : null;

  const wrapperClass =
    config.variant === 'red'
      ? 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200'
      : 'bg-muted/80 border-border text-muted-foreground';

  return (
    <div
      className={`shrink-0 flex items-center justify-between gap-4 border-b px-4 py-2 text-sm ${wrapperClass}`}
    >
      <span>{config.label}</span>

      {isOwner ? (
        <div className="flex shrink-0 items-center gap-3">
          {config.showPortal && portalWsId ? (
            <a
              href={`/api/stripe/portal?workspaceId=${encodeURIComponent(portalWsId)}`}
              className="font-semibold underline underline-offset-2"
            >
              Update payment
            </a>
          ) : null}
          {config.showSubscribe && (
            <button
              type="button"
              onClick={openTrialModal}
              className="font-semibold underline underline-offset-2"
            >
              {subscribeCta ? 'Subscribe' : 'Start trial'}
            </button>
          )}
        </div>
      ) : (
        <span className="shrink-0 text-xs">Contact your workspace owner to restore access.</span>
      )}
    </div>
  );
}
