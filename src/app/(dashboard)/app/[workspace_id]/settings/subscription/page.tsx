import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@utils/supabase/server';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default async function WorkspaceSubscriptionPage({
  params,
}: {
  params: Promise<{ workspace_id: string }>;
}) {
  const { workspace_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const { data: mem } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (mem as { role?: string } | null)?.role;
  if (!role) {
    redirect('/app');
  }

  const { data: ws } = await supabase
    .from('workspaces')
    .select('name, category_type')
    .eq('id', workspace_id)
    .maybeSingle();

  const workspaceName = (ws as { name?: string } | null)?.name?.trim() || 'Socialspace';
  const categoryType = (ws as { category_type?: string } | null)?.category_type ?? '';
  const requiresSubscription = categoryType === 'business' || categoryType === 'fitness';

  const { data: subRow } = await supabase
    .from('workspace_subscriptions')
    .select(
      'status, trial_end, current_period_end, cancel_at_period_end, stripe_price_id, updated_at',
    )
    .eq('workspace_id', workspace_id)
    .maybeSingle();

  const sub = subRow as {
    status?: string;
    trial_end?: string | null;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean | null;
    stripe_price_id?: string | null;
    updated_at?: string | null;
  } | null;

  const isOwner = role === 'owner';

  const { data: stripeCustomer } = isOwner
    ? await supabase
        .from('stripe_customers')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle()
    : { data: null };

  const hasBillingAccount = !!(stripeCustomer as { stripe_customer_id?: string } | null)
    ?.stripe_customer_id;

  const statusLabel = !requiresSubscription
    ? 'Not required'
    : sub?.status
      ? sub.status.replace(/_/g, ' ')
      : 'No subscription';

  const portalHref = `/api/stripe/portal?workspaceId=${encodeURIComponent(workspace_id)}`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-auto bg-background p-4 md:p-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6">
          <Link
            href={`/app/${workspace_id}`}
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Back to socialspace
          </Link>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Subscription & billing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Plan status</CardTitle>
            <CardDescription>
              {requiresSubscription
                ? 'Business and fitness socialspaces use a paid plan after the trial.'
                : 'This socialspace type does not require a paid subscription.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium capitalize text-foreground">{statusLabel}</span>
            </div>
            {requiresSubscription && sub?.trial_end && sub.status === 'trialing' ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Trial ends</span>
                <span className="text-foreground">{formatDate(sub.trial_end)}</span>
              </div>
            ) : null}
            {requiresSubscription && sub?.current_period_end && sub.status === 'active' ? (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Current period ends</span>
                <span className="text-foreground">{formatDate(sub.current_period_end)}</span>
              </div>
            ) : null}
            {requiresSubscription && sub?.cancel_at_period_end ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Your subscription will end after the current billing period.
              </p>
            ) : null}
            {!requiresSubscription ? (
              <p className="text-muted-foreground">
                Community, kids, and class socialspaces stay on the free tier.
              </p>
            ) : null}
            {requiresSubscription && !isOwner ? (
              <p className="text-muted-foreground">
                Only the socialspace owner can change payment methods or cancel billing. You still
                have access according to the socialspace&apos;s plan.
              </p>
            ) : null}
          </CardContent>
          {requiresSubscription && isOwner ? (
            <CardFooter className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
              {hasBillingAccount ? (
                <a
                  href={portalHref}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-transparent bg-primary px-2.5 text-sm font-medium whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Manage billing in Stripe
                </a>
              ) : (
                <p className="w-full text-sm text-muted-foreground">
                  When you start a trial or subscription from the app, your payment method and
                  invoices will be managed here via Stripe.
                </p>
              )}
            </CardFooter>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
