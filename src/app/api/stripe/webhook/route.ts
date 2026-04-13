/**
 * POST /api/stripe/webhook
 *
 * Stripe sends signed events here for every subscription lifecycle change.
 * This is the single source of truth for keeping `workspace_subscriptions`
 * in sync with Stripe's state.
 *
 * Events handled:
 *  - customer.subscription.created       → backup insert (create-trial is primary)
 *  - customer.subscription.updated       → sync status, periods, cancel_at_period_end
 *  - customer.subscription.deleted       → set trial_expired or canceled
 *  - customer.subscription.trial_will_end → send reminder email via Resend
 *  - invoice.payment_succeeded           → confirm active after first charge
 *  - invoice.payment_failed              → set past_due, notify owner
 *
 * Configure the webhook endpoint in the Stripe dashboard:
 *   https://dashboard.stripe.com/webhooks
 *   URL: https://<your-domain>/api/stripe/webhook
 *
 * Set STRIPE_WEBHOOK_SECRET from the webhook signing secret shown in the dashboard.
 */

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import {
  getStripe,
  invoiceSubscriptionId,
  mapStripeStatusToInternal,
  subscriptionPeriodIso,
} from '@/lib/stripe';
import { trackServerEvent } from '@/lib/analytics/server';
import type Stripe from 'stripe';

// Prevent Next.js from parsing the body — Stripe needs the raw bytes to verify the signature.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err);
    return new Response(`Webhook signature error: ${String(err)}`, { status: 400 });
  }

  try {
    const db = createServiceRoleClient();

    switch (event.type) {
      // ── Subscription created (backup path) ────────────────────────────────
      case 'customer.subscription.created': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpsert(db, sub, false);
        break;
      }

      // ── Subscription updated (status, period, cancel flag changes) ────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        // Fetch our current record to know if we were trialing before this event
        const { data: existing } = await db
          .from('workspace_subscriptions')
          .select('status')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();

        const wasTrialing = existing?.status === 'trialing';
        await handleSubscriptionUpsert(db, sub, wasTrialing);
        break;
      }

      // ── Subscription deleted (cancellation or expiry) ─────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const { data: existing } = await db
          .from('workspace_subscriptions')
          .select('status, owner_user_id, workspace_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();

        const wasTrialing = existing?.status === 'trialing';
        const wasActive = existing?.status === 'active';
        const finalStatus = wasTrialing ? 'trial_expired' : 'canceled';

        await db
          .from('workspace_subscriptions')
          .update({
            status: finalStatus,
            cancel_at_period_end: false,
          })
          .eq('stripe_subscription_id', sub.id);

        const workspaceId = (existing as { workspace_id?: string } | null)?.workspace_id ?? null;
        const userId = (existing as { owner_user_id?: string } | null)?.owner_user_id ?? null;

        if (wasTrialing) {
          // Calculate days_into_trial
          const trialStartMs = sub.trial_start ? sub.trial_start * 1000 : null;
          const daysIntoTrial = trialStartMs
            ? Math.floor((Date.now() - trialStartMs) / 86_400_000)
            : 0;
          void trackServerEvent('trial_canceled', {
            workspaceId,
            userId,
            metadata: { days_into_trial: daysIntoTrial },
          });
        } else if (wasActive) {
          void trackServerEvent('subscription_canceled', {
            workspaceId,
            userId,
            metadata: { months_active: 0 },
          });
        }

        console.log(`[webhook] subscription.deleted → ${finalStatus} (sub: ${sub.id})`);
        break;
      }

      // ── Trial ending reminder ─────────────────────────────────────────────
      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription;
        await handleTrialWillEnd(db, sub);
        break;
      }

      // ── Invoice paid (first charge after trial converts to active) ─────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSubId = invoiceSubscriptionId(invoice);
        if (!invoiceSubId) break;

        // Only act on the first real charge (billing_reason = 'subscription_cycle'
        // or 'subscription_create' when there's no trial; after trial it's 'subscription_cycle')
        if (
          invoice.billing_reason === 'subscription_cycle' ||
          invoice.billing_reason === 'subscription_create'
        ) {
          const sub = await stripe.subscriptions.retrieve(invoiceSubId);
          const { start: periodStart, end: periodEnd } = subscriptionPeriodIso(sub);
          await db
            .from('workspace_subscriptions')
            .update({
              status: 'active',
              ...(periodStart != null && { current_period_start: periodStart }),
              ...(periodEnd != null && { current_period_end: periodEnd }),
            })
            .eq('stripe_subscription_id', sub.id);

          console.log(`[webhook] invoice.payment_succeeded → active (sub: ${sub.id})`);

          // trial_converted — first successful charge after a trial
          if (invoice.billing_reason === 'subscription_cycle') {
            const { data: subRow } = await db
              .from('workspace_subscriptions')
              .select('workspace_id, owner_user_id, trial_start, stripe_price_id')
              .eq('stripe_subscription_id', sub.id)
              .maybeSingle();
            const wsId = (subRow as { workspace_id?: string } | null)?.workspace_id ?? null;
            const ownerId = (subRow as { owner_user_id?: string } | null)?.owner_user_id ?? null;
            const trialStart = (subRow as { trial_start?: string | null } | null)?.trial_start;
            const priceId = (subRow as { stripe_price_id?: string | null } | null)?.stripe_price_id ?? '';
            const trialDays = trialStart
              ? Math.floor((Date.now() - new Date(trialStart).getTime()) / 86_400_000)
              : 0;
            void trackServerEvent('trial_converted', {
              workspaceId: wsId,
              userId: ownerId,
              metadata: { plan: priceId, trial_duration_days: trialDays },
            });
          }
        }
        break;
      }

      // ── Invoice payment failed ─────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSubId = invoiceSubscriptionId(invoice);
        if (!invoiceSubId) break;

        await db
          .from('workspace_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', invoiceSubId);

        await handlePaymentFailed(db, invoice);
        console.log(`[webhook] invoice.payment_failed → past_due (sub: ${invoiceSubId})`);
        break;
      }

      default:
        // Unhandled event — acknowledge silently (200) so Stripe doesn't retry
        break;
    }
  } catch (err) {
    console.error(`[webhook] Error handling ${event.type}:`, err);
    // Return 500 so Stripe will retry the event
    return new Response('Webhook handler error', { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function sendResendEmail(body: {
  from: string;
  to: string;
  subject: string;
  html: string;
  logContext: string;
}) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: body.from,
        to: body.to,
        subject: body.subject,
        html: body.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[webhook] Resend failed (${body.logContext}): ${res.status} ${text}`);
      return;
    }

    console.log(`[webhook] email sent (${body.logContext}) to ${body.to}`);
  } catch (e) {
    console.error(`[webhook] Resend request failed (${body.logContext}):`, e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function handleSubscriptionUpsert(
  db: ReturnType<typeof createServiceRoleClient>,
  sub: Stripe.Subscription,
  wasTrialing: boolean,
) {
  const workspaceId = sub.metadata?.workspace_id;
  const ownerUserId = sub.metadata?.supabase_user_id;

  if (!workspaceId || !ownerUserId) {
    console.warn(`[webhook] subscription ${sub.id} missing metadata — skipping DB upsert`);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const productId =
    typeof sub.items.data[0]?.price?.product === 'string'
      ? sub.items.data[0].price.product
      : ((sub.items.data[0]?.price?.product as Stripe.Product | null)?.id ?? null);

  const internalStatus = mapStripeStatusToInternal(sub.status, wasTrialing);
  const { start: periodStart, end: periodEnd } = subscriptionPeriodIso(sub);

  await db.from('workspace_subscriptions').upsert(
    {
      workspace_id: workspaceId,
      owner_user_id: ownerUserId,
      stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      stripe_product_id: productId,
      status: internalStatus,
      trial_start: sub.trial_start ? new Date(sub.trial_start * 1000).toISOString() : null,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    { onConflict: 'workspace_id' },
  );

  console.log(`[webhook] subscription upserted → ${internalStatus} (sub: ${sub.id})`);
}

async function handleTrialWillEnd(
  db: ReturnType<typeof createServiceRoleClient>,
  sub: Stripe.Subscription,
) {
  const workspaceId = sub.metadata?.workspace_id;
  const ownerUserId = sub.metadata?.supabase_user_id;
  if (!workspaceId || !ownerUserId) return;

  // Look up owner email from users table
  const { data: profile } = await db
    .from('users')
    .select('email, full_name')
    .eq('id', ownerUserId)
    .maybeSingle();

  if (!profile?.email) return;

  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  const trialEndFormatted = trialEnd
    ? trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'soon';

  if (!process.env.RESEND_API_KEY) {
    console.warn('[webhook] RESEND_API_KEY not set — skipping trial reminder email');
    return;
  }

  const fromAddress = process.env.RESEND_FROM ?? 'BuddyBubble <noreply@buddybubble.com>';

  await sendResendEmail({
    from: fromAddress,
    to: profile.email,
    subject: 'Your BuddyBubble trial ends soon',
    html: buildTrialReminderEmail({
      name: profile.full_name ?? 'there',
      trialEndFormatted,
    }),
    logContext: 'trial_will_end',
  });
}

async function handlePaymentFailed(
  db: ReturnType<typeof createServiceRoleClient>,
  invoice: Stripe.Invoice,
) {
  const subId = invoiceSubscriptionId(invoice);
  if (!subId) return;
  const { data: subRecord } = await db
    .from('workspace_subscriptions')
    .select('owner_user_id')
    .eq('stripe_subscription_id', subId)
    .maybeSingle();

  if (!subRecord?.owner_user_id) return;

  const { data: profile } = await db
    .from('users')
    .select('email, full_name')
    .eq('id', subRecord.owner_user_id)
    .maybeSingle();

  if (!profile?.email) return;

  if (!process.env.RESEND_API_KEY) return;

  const fromAddress = process.env.RESEND_FROM ?? 'BuddyBubble <noreply@buddybubble.com>';

  await sendResendEmail({
    from: fromAddress,
    to: profile.email,
    subject: 'Action required: BuddyBubble payment failed',
    html: buildPaymentFailedEmail({ name: profile.full_name ?? 'there' }),
    logContext: 'invoice.payment_failed',
  });
}

// ── Email templates (plain HTML — swap for React Email components in Phase 3) ─

function buildTrialReminderEmail({
  name,
  trialEndFormatted,
}: {
  name: string;
  trialEndFormatted: string;
}): string {
  return `
    <p>Hi ${name},</p>
    <p>Your BuddyBubble free trial ends on <strong>${trialEndFormatted}</strong>.</p>
    <p>After that, your subscription will automatically continue and your card on file will be charged — no action needed to keep access.</p>
    <p>If you'd like to cancel before then, you can do so from your workspace subscription settings.</p>
    <p>Thanks for trying BuddyBubble!</p>
  `;
}

function buildPaymentFailedEmail({ name }: { name: string }): string {
  return `
    <p>Hi ${name},</p>
    <p>We weren't able to process your BuddyBubble subscription payment.</p>
    <p>Please update your payment method in your workspace subscription settings to keep access to premium features.</p>
    <p>We'll retry the charge automatically. If payment continues to fail, your workspace will be downgraded to read-only access.</p>
    <p>The BuddyBubble Team</p>
  `;
}
