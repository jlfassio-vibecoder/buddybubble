'use client';

/**
 * StartTrialModal
 *
 * Three-step dialog for workspace billing:
 *
 *   • First-time subscribers: 3-day reverse trial (card on file, charge after trial).
 *   • Trial already used: paid subscription only — no second trial.
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

import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTheme } from 'next-themes';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
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
import { STRIPE_PLAN_META, plansForCategory } from '@/lib/stripe-plans';
import { BILLING_FUNNEL_EVENT_KEYS } from '@/lib/billing-funnel-event-keys';
import { getStripeBillingElementsAppearance } from '@/lib/stripe-elements-appearance';
import { shouldSubscribeWithoutTrial } from '@/lib/subscription-permissions';
import { useSubscriptionStore } from '@/store/subscriptionStore';
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

async function postClientBillingEvents(
  workspaceId: string,
  billingAttemptId: string | null,
  clientSessionId: string,
  events: { eventKey: string; payload?: Record<string, unknown> }[],
) {
  if (!billingAttemptId || events.length === 0) return;
  try {
    await fetch('/api/billing/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        events: events.map((e) => ({
          eventKey: e.eventKey,
          billingAttemptId,
          clientSessionId,
          payload: e.payload ?? {},
        })),
      }),
    });
  } catch {
    /* non-blocking */
  }
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
  const { resolvedTheme } = useTheme();
  const subscriptionStatus = useSubscriptionStore((s) => s.status);
  const trialAvailable = useSubscriptionStore((s) => s.trialAvailable);
  const setTrialAvailable = useSubscriptionStore((s) => s.setTrialAvailable);

  const stripeAppearance = useMemo(() => {
    const isDark =
      resolvedTheme === 'dark' ||
      (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
    return getStripeBillingElementsAppearance(isDark);
  }, [resolvedTheme]);

  const stripePublishableConfigured = Boolean(
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
  /** Paid subscribe flow: no additional trial (trial ended on workspace and/or already used account trial). */
  const subscribeWithoutTrial = shouldSubscribeWithoutTrial(trialAvailable, subscriptionStatus);
  const trialExpiredWorkspace = subscriptionStatus === 'trial_expired';

  const [step, setStep] = useState<Step>('plan');
  const [selectedPlan, setSelectedPlan] = useState<StripePlanKey | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [billingAttemptId, setBillingAttemptId] = useState<string | null>(null);

  const clientSessionId = useMemo(
    () =>
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sess_${Date.now()}`,
    [],
  );

  const stepRef = useRef<Step>('plan');
  stepRef.current = step;
  const billingAttemptIdRef = useRef<string | null>(null);
  billingAttemptIdRef.current = billingAttemptId;
  const modalOpenedAtRef = useRef(0);

  const availablePlans = plansForCategory(categoryType);

  useLayoutEffect(() => {
    if (open) {
      setBillingAttemptId(
        typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : null,
      );
      modalOpenedAtRef.current = Date.now();
    }
  }, [open]);

  // Pre-select first plan when dialog opens
  useEffect(() => {
    if (open && !selectedPlan) {
      setSelectedPlan(availablePlans[0] ?? null);
    }
  }, [open, availablePlans, selectedPlan]);

  useEffect(() => {
    if (!open || !billingAttemptId) return;
    void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
      {
        eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_MODAL_OPENED,
        payload: {
          category_type: categoryType,
          subscription_status: subscriptionStatus,
          trial_available: trialAvailable,
        },
      },
    ]);
    // Intentionally omit subscriptionStatus / trialAvailable from deps so we do not
    // duplicate `billing_modal_opened` while the modal stays open and the store refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot at open only
  }, [open, billingAttemptId, workspaceId, clientSessionId, categoryType]);

  // Reset state after close animation finishes
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setStep('plan');
      setSelectedPlan(null);
      setClientSecret(null);
      setIntentError(null);
      setLoadingIntent(false);
      setBillingAttemptId(null);
    }, 250);
    return () => clearTimeout(t);
  }, [open]);

  const handleContinueToCard = useCallback(async () => {
    if (!selectedPlan) return;
    if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()) {
      setIntentError(
        'Payment form cannot load because Stripe is not configured for this environment.',
      );
      return;
    }
    setLoadingIntent(true);
    setIntentError(null);

    try {
      const res = await fetch('/api/stripe/setup-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          ...(billingAttemptId ? { billingAttemptId } : {}),
        }),
      });

      const data = (await res.json()) as {
        clientSecret?: string;
        error?: string;
        trialAvailable?: boolean;
      };

      if (!res.ok || !data.clientSecret) {
        setIntentError(data.error ?? 'Failed to initialise payment. Please try again.');
        return;
      }

      if (typeof data.trialAvailable === 'boolean') {
        setTrialAvailable(data.trialAvailable);
      }

      setClientSecret(data.clientSecret);
      setStep('card');
    } catch {
      setIntentError('Network error. Please check your connection and try again.');
    } finally {
      setLoadingIntent(false);
    }
  }, [selectedPlan, workspaceId, setTrialAvailable, billingAttemptId]);

  const titleText =
    step === 'success'
      ? subscribeWithoutTrial && trialExpiredWorkspace
        ? 'Premium access restored'
        : subscribeWithoutTrial
          ? "You're subscribed!"
          : 'Trial started!'
      : step === 'card'
        ? subscribeWithoutTrial && trialExpiredWorkspace
          ? 'Complete payment to subscribe'
          : 'Add your payment details'
        : subscribeWithoutTrial
          ? trialExpiredWorkspace
            ? 'Subscribe to continue'
            : 'Subscribe to a plan'
          : 'Start your 3-day free trial';

  const descText =
    step === 'success'
      ? 'Your workspace now has full access to all premium features.'
      : step === 'card'
        ? subscribeWithoutTrial
          ? trialExpiredWorkspace
            ? 'Your free trial has ended. Your card will be charged for your first billing period when you complete payment below.'
            : 'Your card will be charged for your first billing period today. You can manage billing anytime.'
          : 'Your card will not be charged until the trial ends on day 4.'
        : subscribeWithoutTrial
          ? trialExpiredWorkspace
            ? 'Your free trial for this workspace has ended. Choose a plan to restore full access. Billing starts today — there is no additional free trial.'
            : 'Choose a plan. Your subscription starts today — you have already used your free trial.'
          : 'Choose a plan. Your card will be charged after the 3-day trial unless you cancel.';

  const handleDialogOpenChange = useCallback(
    (v: boolean) => {
      if (!v) {
        if (stepRef.current !== 'success' && billingAttemptIdRef.current) {
          void postClientBillingEvents(workspaceId, billingAttemptIdRef.current, clientSessionId, [
            {
              eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_MODAL_ABANDONED,
              payload: {
                step: stepRef.current,
                dwell_ms: Date.now() - modalOpenedAtRef.current,
              },
            },
          ]);
        }
        closeTrialModal();
      }
    },
    [workspaceId, clientSessionId, closeTrialModal],
  );

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="flex max-h-[min(90dvh,44rem)] max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby="trial-modal-desc"
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-6 py-5 text-left">
          <DialogTitle>{titleText}</DialogTitle>
          <DialogDescription id="trial-modal-desc">{descText}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {step === 'plan' && (
            <PlanStep
              availablePlans={availablePlans}
              selectedPlan={selectedPlan}
              stripeConfigured={stripePublishableConfigured}
              onSelectPlan={(k) => {
                setSelectedPlan(k);
                if (billingAttemptId) {
                  void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
                    {
                      eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_PLAN_SELECTED,
                      payload: { plan_key: k },
                    },
                  ]);
                }
              }}
              onContinue={handleContinueToCard}
              loading={loadingIntent}
              error={intentError}
              onCancel={closeTrialModal}
            />
          )}

          {step === 'card' && clientSecret && selectedPlan && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Elements
                stripe={getStripePromise()}
                options={{
                  clientSecret,
                  appearance: stripeAppearance,
                }}
              >
                <CardStep
                  workspaceId={workspaceId}
                  planKey={selectedPlan}
                  billingAttemptId={billingAttemptId}
                  clientSessionId={clientSessionId}
                  subscribeWithoutTrial={subscribeWithoutTrial}
                  trialExpiredWorkspace={trialExpiredWorkspace}
                  onSuccess={() => setStep('success')}
                  onBack={() => setStep('plan')}
                />
              </Elements>
            </div>
          )}

          {step === 'success' && (
            <SuccessStep
              subscribeWithoutTrial={subscribeWithoutTrial}
              trialExpiredWorkspace={trialExpiredWorkspace}
              onClose={closeTrialModal}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Step 1: Plan selector ─────────────────────────────────────────────────────

function PlanStep({
  availablePlans,
  selectedPlan,
  stripeConfigured,
  onSelectPlan,
  onContinue,
  loading,
  error,
  onCancel,
}: {
  availablePlans: StripePlanKey[];
  selectedPlan: StripePlanKey | null;
  stripeConfigured: boolean;
  onSelectPlan: (k: StripePlanKey) => void;
  onContinue: () => void;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
}) {
  const [featuresOpenFor, setFeaturesOpenFor] = useState<StripePlanKey | null>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-6 py-5">
        {(error || !stripeConfigured) && (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {error ??
              (!stripeConfigured
                ? 'Payment setup is unavailable — Stripe is not configured for this environment.'
                : null)}
          </p>
        )}

        {availablePlans.map((key) => {
          const plan = STRIPE_PLAN_META[key];
          const Icon = PLAN_ICONS[key];
          const selected = key === selectedPlan;

          return (
            <div
              key={key}
              className={cn(
                'overflow-hidden rounded-xl border transition-colors',
                selected
                  ? 'border-primary bg-primary/8 ring-1 ring-primary/20'
                  : 'border-border hover:border-input hover:bg-muted/60',
                loading && 'pointer-events-none opacity-60',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectPlan(key)}
                disabled={loading}
                className="flex w-full items-start gap-3 px-4 py-3 text-left"
              >
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                  <p className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">
                    {plan.listPriceLabel}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {plan.description}
                  </p>
                  {plan.maxMembers !== null && (
                    <p className="mt-1 text-xs font-medium text-primary">
                      Up to {plan.maxMembers} member{plan.maxMembers !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>

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

              <div className="border-t border-border/50 px-4 pb-3 pt-0">
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setFeaturesOpenFor(key);
                  }}
                >
                  View features
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={featuresOpenFor !== null}
        onOpenChange={(open) => {
          if (!open) setFeaturesOpenFor(null);
        }}
      >
        <DialogContent className="max-h-[min(85dvh,28rem)] overflow-y-auto sm:max-w-md">
          {featuresOpenFor ? (
            <>
              <DialogHeader>
                <DialogTitle>{STRIPE_PLAN_META[featuresOpenFor].name}</DialogTitle>
                <DialogDescription>Included with this plan:</DialogDescription>
              </DialogHeader>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-foreground">
                {STRIPE_PLAN_META[featuresOpenFor].features.map((f, i) => (
                  <li key={`${featuresOpenFor}-${i}`}>{f}</li>
                ))}
              </ul>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-muted/50 px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={!selectedPlan || loading || !stripeConfigured}
        >
          {loading ? 'Setting up…' : 'Continue to payment'}
        </Button>
      </div>
    </div>
  );
}

// ── Step 2: Stripe card entry ─────────────────────────────────────────────────

function CardStep({
  workspaceId,
  planKey,
  billingAttemptId,
  clientSessionId,
  subscribeWithoutTrial,
  trialExpiredWorkspace,
  onSuccess,
  onBack,
}: {
  workspaceId: string;
  planKey: StripePlanKey;
  billingAttemptId: string | null;
  clientSessionId: string;
  subscribeWithoutTrial: boolean;
  trialExpiredWorkspace: boolean;
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
      void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
        {
          eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_FAILED,
          payload: { phase: 'elements_submit', code: submitError.code ?? null },
        },
      ]);
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
      void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
        {
          eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_FAILED,
          payload: {
            phase: 'confirm_setup',
            code: confirmError.code ?? null,
            decline_code: (confirmError as { decline_code?: string }).decline_code ?? null,
          },
        },
      ]);
      setLoading(false);
      return;
    }

    if (!setupIntent) {
      setError('Payment setup failed. Please try again.');
      void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
        {
          eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_FAILED,
          payload: { phase: 'confirm_setup', code: 'missing_setup_intent' },
        },
      ]);
      setLoading(false);
      return;
    }

    void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
      {
        eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_SUCCEEDED,
        payload: { setup_intent_status: setupIntent.status },
      },
    ]);

    // 3. Extract the confirmed payment method ID
    const paymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : (setupIntent.payment_method as { id?: string } | null)?.id;

    if (!paymentMethodId) {
      setError('Could not retrieve payment method. Please try again.');
      void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
        {
          eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_FAILED,
          payload: { phase: 'payment_method', code: 'missing_pm' },
        },
      ]);
      setLoading(false);
      return;
    }

    // 4–5. Create subscription + refresh store (never leave loading stuck on network/parse errors)
    try {
      const res = await fetch('/api/stripe/create-trial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          planKey,
          paymentMethodId,
          ...(billingAttemptId ? { billingAttemptId } : {}),
        }),
      });

      let data: {
        subscriptionId?: string;
        status?: string;
        trialEnd?: string;
        error?: string;
      };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setError('Could not read the server response. Please try again.');
        void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
          {
            eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_FAILED,
            payload: { phase: 'create_subscription', code: 'invalid_json' },
          },
        ]);
        return;
      }

      if (!res.ok || !data.subscriptionId) {
        setError(
          data.error ??
            (subscribeWithoutTrial
              ? 'Failed to subscribe. Please try again.'
              : 'Failed to start trial. Please try again.'),
        );
        void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
          {
            eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_FAILED,
            payload: {
              phase: 'create_subscription',
              http_status: res.status,
              message: (data.error ?? 'unknown').slice(0, 200),
            },
          },
        ]);
        return;
      }

      await refreshSubscription();
      onSuccess();
    } catch {
      setError(
        subscribeWithoutTrial
          ? 'Network error while subscribing. Check your connection and try again.'
          : 'Network error while starting trial. Check your connection and try again.',
      );
      void postClientBillingEvents(workspaceId, billingAttemptId, clientSessionId, [
        {
          eventKey: BILLING_FUNNEL_EVENT_KEYS.CLIENT_SETUP_FAILED,
          payload: { phase: 'create_subscription', code: 'network' },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden text-foreground"
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
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

        <p className="text-xs leading-relaxed text-foreground/80">
          {subscribeWithoutTrial
            ? trialExpiredWorkspace
              ? 'Completing payment reactivates your subscription for this workspace. You can manage billing anytime in settings.'
              : 'You will be charged for your plan according to the billing cycle. You can cancel or update your plan from billing settings.'
            : 'Your card will not be charged until the 3-day trial ends. Cancel anytime before then from your billing settings.'}
        </p>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-muted/50 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onBack} disabled={loading}>
          ← Back
        </Button>
        <Button type="submit" disabled={!stripe || !elements || loading}>
          {loading
            ? subscribeWithoutTrial
              ? 'Subscribing…'
              : 'Starting trial…'
            : subscribeWithoutTrial
              ? 'Subscribe now'
              : 'Start free trial'}
        </Button>
      </div>
    </form>
  );
}

// ── Step 3: Success confirmation ──────────────────────────────────────────────

function SuccessStep({
  subscribeWithoutTrial,
  trialExpiredWorkspace,
  onClose,
}: {
  subscribeWithoutTrial: boolean;
  trialExpiredWorkspace: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col items-center gap-5 overflow-y-auto overscroll-contain px-6 py-10 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Trophy className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden />
        </div>
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">You&apos;re all set!</p>
          <p className="text-sm text-muted-foreground">
            {subscribeWithoutTrial
              ? trialExpiredWorkspace
                ? 'Your subscription is active again. Premium features for this workspace are restored.'
                : 'Your subscription is active. Full access to AI generation, analytics, and all premium features is now available.'
              : 'Your 3-day free trial has started. Full access to AI generation, analytics, and all premium features is now active. We&apos;ll send you a reminder before the trial ends.'}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 justify-center border-t border-border bg-muted/50 px-6 py-4">
        <Button onClick={onClose}>Start exploring</Button>
      </div>
    </div>
  );
}
