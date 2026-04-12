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
 * Body: { workspaceId: string }
 * Response: { clientSecret: string; customerId: string }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { getStripe } from '@/lib/stripe';

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
    let body: { workspaceId?: string };
    try {
      body = (await req.json()) as { workspaceId?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId.trim() : '';
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
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the workspace owner can start a trial' }, { status: 403 });
    }

    // ── Check workspace requires subscription ───────────────────────────────
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('category_type, name')
      .eq('id', workspaceId)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    if (!['business', 'fitness'].includes(workspace.category_type)) {
      return NextResponse.json({ error: 'This workspace type does not require a subscription' }, { status: 400 });
    }

    // ── Check for existing active subscription ──────────────────────────────
    const { data: existingSub } = await supabase
      .from('workspace_subscriptions')
      .select('status')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (existingSub && ['trialing', 'active'].includes(existingSub.status)) {
      return NextResponse.json(
        { error: 'This workspace already has an active subscription' },
        { status: 409 },
      );
    }

    // ── Enforce one trial per person ────────────────────────────────────────
    const serviceSupabase = createServiceRoleClient();
    const { data: stripeCustomerRow } = await serviceSupabase
      .from('stripe_customers')
      .select('stripe_customer_id, has_had_trial')
      .eq('user_id', user.id)
      .maybeSingle();

    if (stripeCustomerRow?.has_had_trial) {
      return NextResponse.json(
        { error: 'You have already used your free trial. Please subscribe to continue.' },
        { status: 403 },
      );
    }

    // ── Get or create Stripe customer ───────────────────────────────────────
    const stripe = getStripe();
    let stripeCustomerId: string;

    if (stripeCustomerRow?.stripe_customer_id) {
      stripeCustomerId = stripeCustomerRow.stripe_customer_id;
    } else {
      // Fetch user profile for a clean customer name
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

      stripeCustomerId = customer.id;

      // Persist to stripe_customers (upsert — safe if a race created it)
      await serviceSupabase.from('stripe_customers').upsert(
        {
          user_id: user.id,
          stripe_customer_id: stripeCustomerId,
          has_had_trial: false,
        },
        { onConflict: 'user_id' },
      );
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

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId,
    });
  } catch (e) {
    console.error('[setup-intent]', e);
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
