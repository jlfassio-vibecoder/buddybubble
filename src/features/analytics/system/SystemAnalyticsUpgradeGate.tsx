'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { track } from '@/lib/analytics/client';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { usePermissions } from '@/hooks/use-permissions';
import { STRIPE_PLAN_META, type StripePlanKey } from '@/lib/stripe-plans';
import type { SubscriptionStatus } from '@/lib/subscription-permissions';
import type { MemberRole } from '@/types/database';

type Props = {
  workspaceId: string;
  role: MemberRole;
  planKey: StripePlanKey | null;
  status: SubscriptionStatus;
};

export function SystemAnalyticsUpgradeGate({ workspaceId, role, planKey, status }: Props) {
  const openTrialModal = useSubscriptionStore((s) => s.openTrialModal);
  const { isOwner } = usePermissions(role);
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!isOwner || trackedRef.current) return;
    trackedRef.current = true;
    track('feature_gate_hit', {
      workspace_id: workspaceId,
      metadata: { feature_name: 'system_analytics', user_status: status },
    });
  }, [isOwner, workspaceId, status]);

  const planLabel =
    planKey && planKey in STRIPE_PLAN_META
      ? STRIPE_PLAN_META[planKey as keyof typeof STRIPE_PLAN_META].name
      : null;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">
            System Analytics requires Studio
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {isOwner
              ? planLabel
                ? `Your current plan (${planLabel}) does not include AI generation observability. Upgrade to Studio, Studio Pro, or Coach Pro to monitor workout generation errors and recover broken workouts.`
                : 'Upgrade to Studio, Studio Pro, or Coach Pro to monitor AI workout generation errors and recover broken workouts.'
              : 'Ask the socialspace owner to upgrade to Studio Pro or Coach Pro to enable System Analytics for this workspace.'}
          </p>
        </div>
        {isOwner ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button type="button" onClick={() => openTrialModal()}>
              View upgrade options
            </Button>
            <Link
              href={`/app/${workspaceId}/settings/subscription`}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
            >
              Subscription settings
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
