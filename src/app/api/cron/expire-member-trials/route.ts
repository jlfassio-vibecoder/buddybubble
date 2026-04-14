import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Periodic cron: storefront member preview window ended → set onboarding_status to trial_expired.
 * Targets guests only so future non-guest uses of trial_active are unaffected.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel cron).
 *
 * @see docs/tdd-lead-onboarding.md §7
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production') {
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 503 });
    }
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  } else if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const nowIso = new Date().toISOString();

  try {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('workspace_members')
      .update({ onboarding_status: 'trial_expired' })
      .eq('onboarding_status', 'trial_active')
      .eq('role', 'guest')
      .not('trial_expires_at', 'is', null)
      .lt('trial_expires_at', nowIso)
      .select('workspace_id, user_id');

    if (error) {
      console.error('[cron/expire-member-trials]', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const rows = data ?? [];
    return NextResponse.json({
      ok: true,
      expiredCount: rows.length,
      updated: rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cron failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
