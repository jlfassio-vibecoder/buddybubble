/**
 * GET /api/stripe/portal?workspaceId=<id>
 *
 * Creates a Stripe Customer Portal session and redirects the authenticated
 * workspace owner to it. The portal lets owners:
 *   - View billing history and upcoming invoices
 *   - Update their payment method
 *   - Cancel or reactivate their subscription
 *
 * Only the workspace owner can access this — members do not have billing access.
 *
 * Query params: workspaceId (required)
 * Redirects to: Stripe-hosted portal URL (one-time, expires in ~5 min)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { getStripe } from '@/lib/stripe';

export async function GET(req: Request) {
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
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get('workspaceId')?.trim() ?? '';

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    // ── Verify workspace owner ──────────────────────────────────────────────
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only the workspace owner can access billing settings' },
        { status: 403 },
      );
    }

    // ── Fetch Stripe customer ID ────────────────────────────────────────────
    const serviceSupabase = createServiceRoleClient();
    const { data: stripeCustomerRow } = await serviceSupabase
      .from('stripe_customers')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!stripeCustomerRow?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found. Start a trial first.' },
        { status: 404 },
      );
    }

    // ── Build return URL ────────────────────────────────────────────────────
    const siteUrl =
      process.env.SITE_URL ??
      process.env.APP_ORIGIN ??
      process.env.APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

    const returnUrl = `${siteUrl}/app/${workspaceId}/settings/subscription`;

    // ── Create portal session ───────────────────────────────────────────────
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerRow.stripe_customer_id,
      return_url: returnUrl,
    });

    return NextResponse.redirect(session.url);
  } catch (e) {
    console.error('[portal]', e);
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
