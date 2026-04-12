'use client';

/**
 * StartTrialModal
 *
 * Three-step dialog that guides a workspace owner through starting the
 * 3-day reverse trial:
 *
 *   1. Plan selection   — choose the right plan for the workspace
 *   2. Card entry       — Stripe Elements PaymentElement (SetupIntent flow)
 *   3. Success          — confirmation screen, subscription store refreshed
 *
 * Opening: any component calls `useSubscriptionStore.getState().openTrialModal()`
 * or via the `openTrialModal` action from the store selector.
 *
 * The modal reads `trialModalOpen` from subscriptionStore and is rendered
 * once by DashboardShell so it shares the workspace context.
 */

import { useEffect, useState, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Trophy, Dumbbell, Users, Briefcase, Building2, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STRIPE_PLANS, plansForCategory } from '@/lib/stripe-plans';
import { useSubscriptionStore } from '@/store/subscriptionStore';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { StripePlanKey } from '@/lib/stripe-plans';

// ── Stripe.js singleton (safe to call outside render) ─────────────────────────

let _stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripePromise() {
  if (!_stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.warn('[StartTrialModal] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set');
      return null;
    }
    _stripePromise = loadStripe(key);
  }
  return _stripePromise;
}

// ── Plan icon map ─────────────────────────────────────────────────────────────

const PLAN_ICONS: Record<StripePlanKey, typeof Dumbbell> = {
  athlete: Dumbbell,
  host: Users,
  pro: Briefcase,
  studio: Building2,
  coach_pro: Star,
  studio_pro: Trophy,
};

// ── Step types ────────────────────────────────────────────────────────────────

type Step = 'plan' | 'card' | 'success';

// ── Root component ────────────────────────────────────────────────────────────

type Props = {
  workspaceId: string;
  /** Workspace category drives which plans are shown. */
  categoryType: string;
};

/**
 * Reads open/close state from subscriptionStore.
 * DashboardShell renders this once per workspace; pass workspaceId + categoryType.
 */
export function StartTrialModal({ workspaceId, categoryType }: Props) {
  const open = useSubscriptionStore((s) => s.trialModalOpen);
  const closeTrialModal = useSubscriptionStore((s) => s.closeTrialModal);

  const [step, setStep] = useState<Step>('plan');
  const [selectedPlan, setSelectedPlan] = useState<StripePlanKey | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  const availablePlans = plansForCategory(categoryType);

  // Pre-select first plan when dialog opens
  useEffect(() => {
    if (open && !selectedPlan) {
      setSelectedPlan(availablePlans[0] ?? null);
    }
  }, [open, availablePlans, selectedPlan]);

  // Reset state after close animation finishes
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep('plan');
      setSelectedPlan(null);
      setClientSecret(null);
      setIntentError(null);
      setLoadingIntent(false);
    }, 250);
    return () => clearTimeout(t);
  }, [open]);

  const handleContinueToCard = useCallback(async () => {
    if (!selectedPlan) return;
    setLoadingIntent(true);
    setIntentError(null);

    try {
      const res = await fetch('/api/stripe/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });

      const data = (await res.json()) as { clientSecret?: string; error?: string };

      if (!res.ok || !data.clientSecret) {
        setIntentError(data.error ?? 'Failed to initialise payment. Please try again.');
        return;
      }

      setClientSecret(data.clientSecret);
      setStep('card');
    } catch {
      setIntentError('Network error. Please check your connection and try again.');
    } finally {
      setLoadingIntent(false);
    }
  }, [selectedPlan, workspaceId]);

  const titleText =
    step === 'success'
      ? 'Trial started!'
      : step === 'card'
        ? 'Add your payment details'
        : 'Start your 3-day free trial';

  const descText =
    step === 'success'
      ? 'Your workspace now has full access to all premium features.'
      : step === 'card'
        ? 'Your card will not be charged until the trial ends on day 4.'
        : 'Choose a plan. Your card will be charged after the 3-day trial unless you cancel.';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && closeTrialModal()}>
      <DialogContent
        className="max-w-md gap-0 p-0 sm:max-w-lg"
        aria-describedby="trial-modal-desc"
      >
        <DialogHeader className="space-y-1 border-b border-border px-6 py-5 text-left">
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription id="trial-modal-desc">{descText}</DialogDescription>
        </DialogHeader>

        {step === 'plan' && (
          <PlanStep
            availablePlans={availablePlans}
            selectedPlan={selectedPlan}
            onSelectPlan={setSelectedPlan}
            onContinue={handleContinueToCard}
            loading={loadingIntent}
            error={intentError}
            onCancel={closeTrialModal}
          />
        )}

        {step === 'card' && clientSecret && selectedPlan && (
          <Elements
            stripe={getStripePromise()}
            options={{
              clientSecret,
              appearance: {
                theme: 'flat',
                variables: {
                  borderRadius: '8px',
                  fontFamily: 'inherit',
                },
              },
            }}
          >
            <CardStep
              workspaceId={workspaceId}
              planKey={selectedPlan}
              onSuccess={() => setStep('success')}
              onBack={() => setStep('plan')}
            />
          </Elements>
        )}

        {step === 'success' && <SuccessStep onClose={closeTrialModal} />}
      </DialogContent>
    </Dialog>
  );
}

// ── Step 1: Plan selector ─────────────────────────────────────────────────────

function PlanStep({
  availablePlans,
  selectedPlan,
  onSelectPlan,
  onContinue,
  loading,
  error,
  onCancel,
}: {
  availablePlans: StripePlanKey[];
  selectedPlan: StripePlanKey | null;
  onSelectPlan: (k: StripePlanKey) => void;
  onContinue: () => void;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  return (
    <>
      <div className="space-y-2.5 px-6 py-5">
        {error && (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        {availablePlans.map((key) => {
          const plan = STRIPE_PLANS[key];
          const Icon = PLAN_ICONS[key];
          const selected = key === selectedPlan;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectPlan(key)}
              disabled={loading}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                selected
                  ? 'border-primary bg-primary/8 ring-1 ring-primary/20'
                  : 'border-border hover:border-input hover:bg-muted/60',
                loading && 'pointer-events-none opacity-60',
              )}
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" aria-hidden />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                  {plan.description}
                </p>
                {plan.maxMembers !== null && (
                  <p className="mt-1 text-xs font-medium text-primary">
                    Up to {plan.maxMembers} member{plan.maxMembers !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Radio dot */}
              <div
                className={cn(
                  'mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
                  selected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
                )}
                aria-hidden
              >
                {selected && (
                  <div className="m-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/50 px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={onContinue} disabled={!selectedPlan || loading}>
          {loading ? 'Setting up…' : 'Continue to payment'}
        </Button>
      </div>
    </>
  );
}

// ── Step 2: Stripe card entry ─────────────────────────────────────────────────

function CardStep({
  workspaceId,
  planKey,
  onSuccess,
  onBack,
}: {
  workspaceId: string;
  planKey: StripePlanKey;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const refreshSubscription = useSubscriptionStore((s) => s.refreshSubscription);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setLoading(true);
    setError(null);

    // 1. Validate the elements fields client-side
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Please check your card details.');
      setLoading(false);
      return;
    }

    // 2. Confirm the SetupIntent (attaches payment method to customer)
    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: {
        // Used only if 3DS redirect is triggered
        return_url: `${window.location.origin}/app/${workspaceId}?trial_started=1`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message ?? 'Payment setup failed. Please try again.');
      setLoading(false);
      return;
    }

    if (!setupIntent) {
      setError('Payment setup failed. Please try again.');
      setLoading(false);
      return;
    }

    // 3. Extract the confirmed payment method ID
    const paymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : (setupIntent.payment_method as { id?: string } | null)?.id;

    if (!paymentMethodId) {
      setError('Could not retrieve payment method. Please try again.');
      setLoading(false);
      return;
    }

    // 4. Create the Stripe subscription (3-day trial)
    const res = await fetch('/api/stripe/create-trial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, planKey, paymentMethodId }),
    });

    const data = (await res.json()) as {
      subscriptionId?: string;
      status?: string;
      trialEnd?: string;
      error?: string;
    };

    if (!res.ok || !data.subscriptionId) {
      setError(data.error ?? 'Failed to start trial. Please try again.');
      setLoading(false);
      return;
    }

    // 5. Sync subscription store so banners + gates update immediately
    await refreshSubscription();
    onSuccess();
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4 px-6 py-5">
        {error && (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}

        <PaymentElement
          options={{
            layout: 'tabs',
          }}
        />

        <p className="text-xs text-muted-foreground">
          Your card will not be charged until the 3-day trial ends. Cancel anytime before then
          from your billing settings.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/50 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onBack} disabled={loading}>
          ← Back
        </Button>
        <Button type="submit" disabled={!stripe || !elements || loading}>
          {loading ? 'Starting trial…' : 'Start free trial'}
        </Button>
      </div>
    </form>
  );
}

// ── Step 3: Success confirmation ──────────────────────────────────────────────

function SuccessStep({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="flex flex-col items-center gap-5 px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Trophy className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">You&apos;re all set!</p>
          <p className="text-sm text-muted-foreground">
            Your 3-day free trial has started. Full access to AI generation, analytics, and all
            premium features is now active. We&apos;ll send you a reminder before the trial ends.
          </p>
        </div>
      </div>

      <div className="flex justify-center border-t border-border bg-muted/50 px-6 py-4">
        <Button onClick={onClose}>Start exploring</Button>
      </div>
    </>
  );
}
