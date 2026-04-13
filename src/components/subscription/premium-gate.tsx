'use client';

/**
 * PremiumGate
 *
 * Wraps any UI element that requires an active subscription.
 * When the workspace is on a free / expired / no-subscription plan:
 *   - renders a dimmed, pointer-events-blocked version of the children
 *   - overlays a lock badge
 *   - on click: opens the StartTrialModal (via subscriptionStore)
 *
 * When the workspace has an active subscription (trialing or active),
 * or does not require one (community / kids / class), children render normally.
 *
 * Usage:
 *   <PremiumGate feature="ai">
 *     <GenerateWorkoutButton />
 *   </PremiumGate>
 */

import { Lock } from 'lucide-react';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { usePermissions } from '@/hooks/use-permissions';
import { parseMemberRole } from '@/lib/permissions';
import {
  resolveSubscriptionPermissions,
  shouldSubscribeWithoutTrial,
} from '@/lib/subscription-permissions';
import { cn } from '@/lib/utils';
import { track } from '@/lib/analytics/client';
import type { WorkspaceCategory } from '@/types/database';
import type { MemberRole } from '@/types/database';
import type { SubscriptionStatus } from '@/lib/subscription-permissions';

// ── Feature keys ──────────────────────────────────────────────────────────────

export type PremiumFeature =
  | 'ai'
  | 'analytics'
  | 'export'
  | 'record_data'
  | 'custom_branding'
  | 'create_workspace';

const FEATURE_LABELS: Record<PremiumFeature, string> = {
  ai: 'AI generation',
  analytics: 'Analytics',
  export: 'Data export',
  record_data: 'Recording data',
  custom_branding: 'Custom branding',
  create_workspace: 'Creating workspaces',
};

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  feature: PremiumFeature;
  children: React.ReactNode;
  /** Extra Tailwind classes applied to the outer wrapper. */
  className?: string;
  /**
   * When true, renders an inline "Unlock" button rather than a full-overlay lock.
   * Useful for small icon buttons where an overlay would obscure context.
   */
  inline?: boolean;
};

export function PremiumGate({ feature, children, className, inline = false }: Props) {
  const status = useSubscriptionStore((s) => s.status);
  const trialAvailable = useSubscriptionStore((s) => s.trialAvailable);
  const openTrialModal = useSubscriptionStore((s) => s.openTrialModal);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const role = parseMemberRole(
    String((activeWorkspace as { role?: string } | null)?.role ?? 'member'),
  ) as MemberRole;
  const { isOwner } = usePermissions(role);

  // Not yet loaded or workspace type is free — pass through
  if (status === null || status === 'not_required') {
    return <>{children}</>;
  }

  const categoryType = (activeWorkspace?.category_type ?? 'business') as WorkspaceCategory;
  const subStatus = status === 'no_subscription' ? null : (status as SubscriptionStatus);
  const perms = resolveSubscriptionPermissions(categoryType, subStatus);

  const subscribeCta = shouldSubscribeWithoutTrial(trialAvailable, status);

  const allowed =
    feature === 'ai'
      ? perms.canUseAI
      : feature === 'analytics'
        ? perms.canViewAnalytics
        : feature === 'export'
          ? perms.canExportData
          : feature === 'record_data'
            ? perms.canRecordNewData
            : feature === 'custom_branding'
              ? perms.canCustomizeBranding
              : feature === 'create_workspace'
                ? perms.canCreatePaidWorkspace
                : false;

  if (allowed) return <>{children}</>;

  // ── Locked ────────────────────────────────────────────────────────────────

  function handleUnlock() {
    if (!isOwner) return;
    track('feature_gate_hit', {
      workspace_id: activeWorkspace?.id,
      metadata: { feature_name: feature, user_status: status },
    });
    openTrialModal();
  }

  if (!isOwner) {
    if (inline) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground',
            className,
          )}
          title="Only the workspace owner can manage billing."
        >
          <Lock className="h-3 w-3" aria-hidden />
          Owner only
        </span>
      );
    }
    return (
      <div className={cn('relative', className)}>
        <div className="pointer-events-none select-none opacity-35" aria-hidden>
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
          <div className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm ring-1 ring-border">
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            Ask the workspace owner to subscribe
          </div>
        </div>
      </div>
    );
  }

  if (inline) {
    return (
      <button
        type="button"
        onClick={handleUnlock}
        title={`${FEATURE_LABELS[feature]} requires a subscription`}
        className={cn(
          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
          'text-muted-foreground ring-1 ring-border hover:bg-muted hover:text-foreground',
          className,
        )}
      >
        <Lock className="h-3 w-3" aria-hidden />
        {subscribeCta ? 'Subscribe' : 'Unlock'}
      </button>
    );
  }

  return (
    <div
      className={cn('relative', className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleUnlock();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleUnlock();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${FEATURE_LABELS[feature]} — requires a subscription. Activate to subscribe.`}
    >
      {/* Dim the locked content */}
      <div className="pointer-events-none select-none opacity-35" aria-hidden>
        {children}
      </div>

      {/* Lock badge overlay */}
      <div className="absolute inset-0 flex cursor-pointer items-center justify-center">
        <div className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm ring-1 ring-border">
          <Lock className="h-3 w-3 shrink-0" aria-hidden />
          {subscribeCta ? 'Subscribe' : 'Unlock with trial'}
        </div>
      </div>
    </div>
  );
}
