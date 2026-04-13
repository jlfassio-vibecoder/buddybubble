/**
 * POST /api/stripe/create-trial
 *
 * Step 2 of the billing flow (called after the SetupIntent is confirmed).
 *
 * **First-time subscribers (has_had_trial = false):**
 * 1. Atomically sets has_had_trial = true.
 * 2. Attaches payment method, creates a Stripe Subscription with a 3-day trial.
 * 3. Upserts workspace_subscriptions as trialing.
 *
 * **Returning subscribers (has_had_trial = true — trial already used):**
 * 1. No second trial; creates a paid subscription immediately (no trial_period_days).
 * 2. Upserts workspace_subscriptions from Stripe status (usually active).
 *
 * Body: {
 *   workspaceId: string;
 *   planKey: StripePlanKey;
 *   paymentMethodId: string;
 *   billingAttemptId?: string;
 * }
 *
 * Response: { subscriptionId, status, trialEnd?, subscribeWithoutTrial: boolean }
 */

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import {
  getStripe,
  getStripePlans,
  retrieveEffectivePlanPrice,
  subscriptionPeriodIso,
  TRIAL_PERIOD_DAYS,
  mapStripeStatusToInternal,
} from '@/lib/stripe';
import type { StripePlanKey } from '@/lib/stripe';
import { trackServerEvent } from '@/lib/analytics/server';
import { STRIPE_PLAN_KEYS } from '@/lib/stripe-plans';
import { BILLING_FUNNEL_EVENT_KEYS, insertBillingFunnelEvent } from '@/lib/billing-funnel-events';

const VALID_PLAN_KEYS = new Set<string>(STRIPE_PLAN_KEYS);

export async function POST(req: Request) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ── Input ───────────────────────────────────────────────────────────────
    let body: {
      workspaceId?: string;
      planKey?: string;
      paymentMethodId?: string;
      billingAttemptId?: string;
    };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    const planKey = typeof body.planKey === 'string' ? body.planKey.trim() : '';
    const paymentMethodId =
      typeof body.paymentMethodId === 'string' ? body.paymentMethodId.trim() : '';
    const billingAttemptId =
      typeof body.billingAttemptId === 'string' ? body.billingAttemptId.trim() : null;

    if (!workspaceId || !planKey || !paymentMethodId) {
      return NextResponse.json(
        { error: 'workspaceId, planKey, and paymentMethodId are required' },
        { status: 400 },
      );
    }

    if (!VALID_PLAN_KEYS.has(planKey)) {
      return NextResponse.json({ error: `Invalid planKey: ${planKey}` }, { status: 400 });
    }

    const plan = getStripePlans()[planKey as StripePlanKey];

    // ── Verify workspace owner ──────────────────────────────────────────────
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can subscribe' },
        { status: 403 },
      );
    }

    // ── Check workspace category ────────────────────────────────────────────
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('category_type, name')
      .eq('id', workspaceId)
      .single();

    if (!workspace || !['business', 'fitness'].includes(workspace.category_type)) {
      return NextResponse.json(
        { error: 'Workspace type does not require a subscription' },
        { status: 400 },
      );
    }

    // ── Check no active subscription already exists ─────────────────────────
    const serviceSupabase = createServiceRoleClient();
    const { data: existingSub } = await serviceSupabase
      .from('workspace_subscriptions')
      .select('status, stripe_subscription_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (existingSub && ['trialing', 'active'].includes(existingSub.status)) {
      return NextResponse.json(
        { error: 'Workspace already has an active subscription' },
        { status: 409 },
      );
    }

    // ── Trial vs pay-now: one trial per user; pay-now if trial already used ─
    const { data: customerRow } = await serviceSupabase
      .from('stripe_customers')
      .select('stripe_customer_id, has_had_trial')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!customerRow?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No Stripe customer found. Please start from the payment setup step.' },
        { status: 400 },
      );
    }

    let useTrial = !customerRow.has_had_trial;
    let stripeCustomerId = customerRow.stripe_customer_id;

    if (useTrial) {
      const { data: claimed } = await serviceSupabase
        .from('stripe_customers')
        .update({ has_had_trial: true })
        .eq('user_id', user.id)
        .eq('has_had_trial', false)
        .select('stripe_customer_id')
        .maybeSingle();

      if (!claimed?.stripe_customer_id) {
        const { data: r2 } = await serviceSupabase
          .from('stripe_customers')
          .select('stripe_customer_id, has_had_trial')
          .eq('user_id', user.id)
          .maybeSingle();

        if (r2?.stripe_customer_id && r2.has_had_trial) {
          useTrial = false;
          stripeCustomerId = r2.stripe_customer_id;
        } else {
          return NextResponse.json(
            { error: 'Could not verify billing account. Please try again.' },
            { status: 409 },
          );
        }
      } else {
        stripeCustomerId = claimed.stripe_customer_id;
      }
    }

    const subscribeWithoutTrial = !useTrial;
    const stripe = getStripe();

    let subscriptionCreated = false;

    await insertBillingFunnelEvent({
      source: 'server',
      eventKey: BILLING_FUNNEL_EVENT_KEYS.SUBSCRIPTION_CREATE_STARTED,
      workspaceId,
      userId: user.id,
      billingAttemptId,
      payload: { plan_key: planKey, subscribe_without_trial: subscribeWithoutTrial },
    });

    try {
      // ── Attach payment method and set as default ────────────────────────────
      await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      const effectivePrice = await retrieveEffectivePlanPrice(
        stripe,
        plan.productId,
        plan.defaultPriceId,
      );

      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: stripeCustomerId,
        items: [{ price: effectivePrice.id }],
        default_payment_method: paymentMethodId,
        metadata: {
          workspace_id: workspaceId,
          supabase_user_id: user.id,
          plan_key: planKey,
        },
      };

      if (useTrial) {
        subscriptionParams.trial_period_days = TRIAL_PERIOD_DAYS;
        subscriptionParams.trial_settings = {
          end_behavior: { missing_payment_method: 'cancel' },
        };
      }

      const subscription = await stripe.subscriptions.create(subscriptionParams);

      subscriptionCreated = true;

      const internalStatus = mapStripeStatusToInternal(subscription.status, false);

      const trialEnd =
        useTrial && subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null;

      const trialStart = useTrial
        ? subscription.trial_start != null
          ? new Date(subscription.trial_start * 1000).toISOString()
          : subscription.start_date != null
            ? new Date(subscription.start_date * 1000).toISOString()
            : new Date().toISOString()
        : null;

      const { start: periodStart, end: periodEnd } = subscriptionPeriodIso(subscription);

      // ── Upsert workspace_subscriptions ──────────────────────────────────────
      const { error: subError } = await serviceSupabase.from('workspace_subscriptions').upsert(
        {
          workspace_id: workspaceId,
          owner_user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: effectivePrice.id,
          stripe_product_id: plan.productId,
          status: internalStatus,
          trial_start: trialStart,
          trial_end: trialEnd,
          current_period_start: periodStart,
          current_period_end: periodEnd,
          cancel_at_period_end: false,
        },
        { onConflict: 'workspace_id' },
      );

      if (subError) {
        console.error('[create-trial] workspace_subscriptions upsert failed:', subError);
      }

      // ── Convert lead record if present ──────────────────────────────────────
      await serviceSupabase
        .from('leads')
        .update({ converted_at: new Date().toISOString(), user_id: user.id })
        .eq('workspace_id', workspaceId)
        .is('converted_at', null)
        .not('user_id', 'is', null)
        .eq('user_id', user.id);

      if (useTrial) {
        void trackServerEvent('trial_started', {
          workspaceId,
          userId: user.id,
          metadata: { plan: planKey },
        });
      }

      await insertBillingFunnelEvent({
        source: 'server',
        eventKey: BILLING_FUNNEL_EVENT_KEYS.SUBSCRIPTION_SUCCEEDED,
        workspaceId,
        userId: user.id,
        billingAttemptId,
        payload: {
          plan_key: planKey,
          internal_status: internalStatus,
          subscribe_without_trial: subscribeWithoutTrial,
          subscription_id_suffix: subscription.id.slice(-8),
        },
      });

      return NextResponse.json({
        subscriptionId: subscription.id,
        status: internalStatus,
        trialEnd,
        subscribeWithoutTrial,
      });
    } catch (inner) {
      if (!subscriptionCreated && useTrial) {
        await serviceSupabase
          .from('stripe_customers')
          .update({ has_had_trial: false })
          .eq('user_id', user.id);
      }

      const errMsg =
        inner instanceof Error
          ? inner.message.slice(0, 500)
          : typeof inner === 'object' &&
              inner !== null &&
              'message' in inner &&
              typeof (inner as { message?: unknown }).message === 'string'
            ? String((inner as { message: string }).message).slice(0, 500)
            : 'unknown_error';
      const errCode =
        typeof inner === 'object' &&
        inner !== null &&
        'code' in inner &&
        typeof (inner as { code?: unknown }).code === 'string'
          ? (inner as { code: string }).code
          : undefined;

      await insertBillingFunnelEvent({
        source: 'server',
        eventKey: BILLING_FUNNEL_EVENT_KEYS.SUBSCRIPTION_FAILED,
        workspaceId,
        userId: user.id,
        billingAttemptId,
        payload: {
          plan_key: planKey,
          message: errMsg,
          ...(errCode ? { code: errCode } : {}),
        },
      });

      throw inner;
    }
  } catch (e) {
    console.error('[create-trial]', e);
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
