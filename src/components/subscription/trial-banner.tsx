'use client';

/**
 * TrialBanner
 *
 * Sticky amber bar shown when the workspace is in trialing status.
 * Displays a countdown and a "Manage billing" link for owners.
 * Rendered once by DashboardShell between the top bar and the main content.
 */

import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { usePermissions } from '@/hooks/use-permissions';
import { parseMemberRole } from '@/lib/permissions';
import type { MemberRole } from '@/types/database';

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export function TrialBanner() {
  const status = useSubscriptionStore((s) => s.status);
  const trialEnd = useSubscriptionStore((s) => s.trialEnd);
  const activeWorkspace = useWorkspaceStore((s) => s.activeWorkspace);

  const role = parseMemberRole(
    String((activeWorkspace as { role?: string } | null)?.role ?? 'member'),
  ) as MemberRole;
  const { isOwner } = usePermissions(role);

  if (status !== 'trialing') return null;

  const days = daysUntil(trialEnd);
  const daysLabel =
    days === null
      ? 'Trial active'
      : days === 0
        ? 'Trial ends today'
        : days === 1
          ? '1 day left in trial'
          : `${days} days left in trial`;

  // Copilot suggestion ignored: Follow-up review duplicated the same portal URL hardening (non-empty id + encodeURIComponent) consolidated here.
  const portalWsId =
    typeof activeWorkspace?.id === 'string' && activeWorkspace.id.length > 0
      ? activeWorkspace.id
      : null;

  return (
    <div className="shrink-0 flex items-center justify-between gap-4 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border-b border-amber-200 dark:border-amber-800">
      <span className="font-medium">{daysLabel} — your card will be charged when it ends.</span>
      {isOwner && portalWsId ? (
        <a
          href={`/api/stripe/portal?workspaceId=${encodeURIComponent(portalWsId)}`}
          className="shrink-0 font-semibold underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-100"
        >
          Manage billing
        </a>
      ) : null}
    </div>
  );
}
