/**
 * POST /api/stripe/setup-intent
 *
 * Step 1 of the trial start flow.
 *
 * Creates (or retrieves) a Stripe Customer for the authenticated user and
 * returns a SetupIntent client_secret.  The frontend mounts Stripe Elements
 * using this secret to securely collect the user's payment method.
 *
 * Once the user confirms the SetupIntent (card attached), the frontend calls
 * POST /api/stripe/create-trial to create the subscription.
 *
 * Body: { workspaceId: string; billingAttemptId?: string }
 * Response: { clientSecret: string; customerId: string; trialAvailable: boolean }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { getStripe, getStripePlans, isStripeResourceMissingError } from '@/lib/stripe';
import { BILLING_FUNNEL_EVENT_KEYS, insertBillingFunnelEvent } from '@/lib/billing-funnel-events';

export async function POST(req: Request) {
  /** Set after owner + workspace checks pass — used for error-path funnel logging. */
  let funnelAnalytics: {
    workspaceId: string;
    userId: string;
    billingAttemptId: string | null;
  } | null = null;

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
    let body: { workspaceId?: string; billingAttemptId?: string };
    try {
      body = (await req.json()) as { workspaceId?: string; billingAttemptId?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
    const billingAttemptId =
      typeof body.billingAttemptId === 'string' ? body.billingAttemptId.trim() : null;
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // ── Verify workspace owner ──────────────────────────────────────────────
    const { data: membership, error: memberError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !membership) {
      return NextResponse.json({ error: 'Socialspace not found' }, { status: 404 });
    }
    if (membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the socialspace owner can manage billing' },
        { status: 403 },
      );
    }

    funnelAnalytics = { workspaceId, userId: user.id, billingAttemptId };

    // ── Check workspace requires subscription ───────────────────────────────
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('category_type, name')
      .eq('id', workspaceId)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Socialspace not found' }, { status: 404 });
    }

    if (!['business', 'fitness'].includes(workspace.category_type)) {
      return NextResponse.json(
        { error: 'This socialspace type does not require a subscription' },
        { status: 400 },
      );
    }

    // ── Check for existing active subscription ──────────────────────────────
    const { data: existingSub } = await supabase
      .from('workspace_subscriptions')
      .select('status')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (existingSub && ['trialing', 'active'].includes(existingSub.status)) {
      return NextResponse.json(
        { error: 'This socialspace already has an active subscription' },
        { status: 409 },
      );
    }

    // has_had_trial only affects whether the subscription gets a trial (see create-trial).
    const serviceSupabase = createServiceRoleClient();
    const { data: stripeCustomerRow } = await serviceSupabase
      .from('stripe_customers')
      .select('stripe_customer_id, has_had_trial')
      .eq('user_id', user.id)
      .maybeSingle();

    const stripe = getStripe();
    getStripePlans();

    // Resolve a real Stripe customer id (DB may hold a stale id from another env or seed data).
    let resolvedCustomerId: string | null = stripeCustomerRow?.stripe_customer_id ?? null;

    if (resolvedCustomerId) {
      try {
        await stripe.customers.retrieve(resolvedCustomerId);
      } catch (e) {
        if (isStripeResourceMissingError(e)) {
          console.warn(
            '[setup-intent] Stale Stripe customer id in DB; creating or replacing customer',
          );
          resolvedCustomerId = null;
        } else {
          throw e;
        }
      }
    }

    if (!resolvedCustomerId) {
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle();

      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email ?? undefined,
        name: profile?.full_name ?? undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      const newId = customer.id;

      if (stripeCustomerRow) {
        const { error: updateErr } = await serviceSupabase
          .from('stripe_customers')
          .update({ stripe_customer_id: newId })
          .eq('user_id', user.id);

        if (updateErr) {
          console.error(
            '[setup-intent] stripe_customers update (replace stale id) failed:',
            updateErr,
          );
          try {
            await stripe.customers.del(newId);
          } catch {
            /* best-effort */
          }
          return NextResponse.json({ error: 'Failed to save billing account' }, { status: 500 });
        }
        resolvedCustomerId = newId;
      } else {
        const { error: insertErr } = await serviceSupabase.from('stripe_customers').insert({
          user_id: user.id,
          stripe_customer_id: newId,
          has_had_trial: false,
        });

        if (insertErr) {
          const code = (insertErr as { code?: string }).code;
          if (code === '23505') {
            const { data: existing } = await serviceSupabase
              .from('stripe_customers')
              .select('stripe_customer_id')
              .eq('user_id', user.id)
              .maybeSingle();
            if (existing?.stripe_customer_id) {
              try {
                await stripe.customers.del(customer.id);
              } catch {
                /* best-effort cleanup of duplicate Stripe customer */
              }
              resolvedCustomerId = existing.stripe_customer_id;
            } else {
              return NextResponse.json(
                { error: 'Failed to save billing account' },
                { status: 500 },
              );
            }
          } else {
            console.error('[setup-intent] stripe_customers insert failed:', insertErr);
            try {
              await stripe.customers.del(newId);
            } catch {
              /* best-effort */
            }
            return NextResponse.json({ error: 'Failed to save billing account' }, { status: 500 });
          }
        } else {
          resolvedCustomerId = newId;
        }
      }
    }

    const stripeCustomerId = resolvedCustomerId;
    if (!stripeCustomerId) {
      return NextResponse.json({ error: 'Could not resolve billing account' }, { status: 500 });
    }

    // ── Create SetupIntent ──────────────────────────────────────────────────
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session', // card will be charged server-side after trial
      metadata: {
        workspace_id: workspaceId,
        supabase_user_id: user.id,
      },
    });

    if (!setupIntent.client_secret) {
      console.error('[setup-intent] SetupIntent missing client_secret', setupIntent.id);
      return NextResponse.json(
        { error: 'Could not start payment setup — try again shortly.' },
        { status: 500 },
      );
    }

    const { data: finalRow } = await serviceSupabase
      .from('stripe_customers')
      .select('has_had_trial')
      .eq('user_id', user.id)
      .maybeSingle();

    const trialAvailable = !finalRow?.has_had_trial;

    await insertBillingFunnelEvent({
      source: 'server',
      eventKey: BILLING_FUNNEL_EVENT_KEYS.SETUP_INTENT_STARTED,
      workspaceId,
      userId: user.id,
      billingAttemptId,
      payload: {
        setup_intent_id_suffix: setupIntent.id.slice(-8),
      },
    });

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId,
      trialAvailable,
    });
  } catch (e) {
    console.error('[setup-intent]', e);
    const msg = e instanceof Error ? e.message : 'Internal error';

    if (funnelAnalytics) {
      await insertBillingFunnelEvent({
        source: 'server',
        eventKey: BILLING_FUNNEL_EVENT_KEYS.SETUP_INTENT_FAILED,
        workspaceId: funnelAnalytics.workspaceId,
        userId: funnelAnalytics.userId,
        billingAttemptId: funnelAnalytics.billingAttemptId,
        payload: { message: String(msg).slice(0, 500) },
      });
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
