/**
 * POST /api/stripe/create-trial
 *
 * Step 2 of the trial start flow (called after the SetupIntent is confirmed).
 *
 * 1. Attaches the confirmed payment method to the Stripe customer.
 * 2. Sets it as the customer's default payment method.
 * 3. Creates a Stripe Subscription with a 3-day trial.
 *    The card is NOT charged until the trial ends — unless the user cancels.
 * 4. Inserts a `workspace_subscriptions` row with status = 'trialing'.
 * 5. Marks `stripe_customers.has_had_trial = true` (prevents future free trials).
 * 6. If a lead record exists for this user + workspace, stamps `converted_at`.
 *
 * Body: {
 *   workspaceId: string;
 *   planKey: StripePlanKey;       // e.g. 'athlete' | 'host' | 'pro' | ...
 *   paymentMethodId: string;      // pm_xxx returned by Stripe Elements
 * }
 *
 * Response: { subscriptionId: string; status: string; trialEnd: string }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { getStripe, STRIPE_PLANS, subscriptionPeriodIso, TRIAL_PERIOD_DAYS } from '@/lib/stripe';
import type { StripePlanKey } from '@/lib/stripe';
import { trackServerEvent } from '@/lib/analytics/server';

const VALID_PLAN_KEYS = new Set<string>(Object.keys(STRIPE_PLANS));

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
    let body: { workspaceId?: string; planKey?: string; paymentMethodId?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    const planKey = typeof body.planKey === 'string' ? body.planKey.trim() : '';
    const paymentMethodId =
      typeof body.paymentMethodId === 'string' ? body.paymentMethodId.trim() : '';

    if (!workspaceId || !planKey || !paymentMethodId) {
      return NextResponse.json(
        { error: 'workspaceId, planKey, and paymentMethodId are required' },
        { status: 400 },
      );
    }

    if (!VALID_PLAN_KEYS.has(planKey)) {
      return NextResponse.json({ error: `Invalid planKey: ${planKey}` }, { status: 400 });
    }

    const plan = STRIPE_PLANS[planKey as StripePlanKey];

    // ── Verify workspace owner ──────────────────────────────────────────────
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can start a trial' },
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

    // ── Claim one-time trial atomically (must exist from setup-intent step) ─
    const { data: claimed } = await serviceSupabase
      .from('stripe_customers')
      .update({ has_had_trial: true })
      .eq('user_id', user.id)
      .eq('has_had_trial', false)
      .select('stripe_customer_id')
      .maybeSingle();

    if (!claimed?.stripe_customer_id) {
      const { data: check } = await serviceSupabase
        .from('stripe_customers')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!check?.stripe_customer_id) {
        return NextResponse.json(
          { error: 'No Stripe customer found. Please start from the payment setup step.' },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: 'You have already used your free trial.' },
        { status: 403 },
      );
    }

    const stripeCustomerId = claimed.stripe_customer_id;
    const stripe = getStripe();

    let subscriptionCreated = false;

    try {
      // ── Attach payment method and set as default ────────────────────────────
      await stripe.paymentMethods.attach(paymentMethodId, { customer: stripeCustomerId });
      await stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // ── Create subscription with trial ──────────────────────────────────────
      const subscription = await stripe.subscriptions.create({
        customer: stripeCustomerId,
        items: [{ price: plan.defaultPriceId }],
        trial_period_days: TRIAL_PERIOD_DAYS,
        default_payment_method: paymentMethodId,
        metadata: {
          workspace_id: workspaceId,
          supabase_user_id: user.id,
          plan_key: planKey,
        },
        // Send trial ending reminder via webhook (fires when ≤3 days remain)
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' },
        },
      });

      subscriptionCreated = true;

      const trialEnd = subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null;

      const trialStart = subscription.start_date
        ? new Date(subscription.start_date * 1000).toISOString()
        : new Date().toISOString();

      const { start: periodStart, end: periodEnd } = subscriptionPeriodIso(subscription);

      // ── Upsert workspace_subscriptions ──────────────────────────────────────
      const { error: subError } = await serviceSupabase.from('workspace_subscriptions').upsert(
        {
          workspace_id: workspaceId,
          owner_user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: plan.defaultPriceId,
          stripe_product_id: plan.productId,
          status: 'trialing',
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
        // Non-fatal — webhook will sync on next event, but log it
      }

      // ── Convert lead record if present ──────────────────────────────────────
      await serviceSupabase
        .from('leads')
        .update({ converted_at: new Date().toISOString(), user_id: user.id })
        .eq('workspace_id', workspaceId)
        .is('converted_at', null)
        .not('user_id', 'is', null) // only if we already linked this user
        .eq('user_id', user.id);

      void trackServerEvent('trial_started', {
        workspaceId,
        userId: user.id,
        metadata: { plan: planKey },
      });

      return NextResponse.json({
        subscriptionId: subscription.id,
        status: 'trialing',
        trialEnd,
      });
    } catch (inner) {
      if (!subscriptionCreated) {
        await serviceSupabase
          .from('stripe_customers')
          .update({ has_had_trial: false })
          .eq('user_id', user.id);
      }
      throw inner;
    }
  } catch (e) {
    console.error('[create-trial]', e);
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
