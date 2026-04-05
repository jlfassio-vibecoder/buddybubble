import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-service-role';
import { buildPromotionBatches } from '@/lib/scheduled-task-promotion';
import { isMissingColumnSchemaCacheError } from '@/lib/supabase-schema-errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Hourly cron: move tasks from `scheduled` → `today` when `scheduled_on` matches workspace local date.
 * Auth: `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set (Vercel cron injects this).
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

  try {
    const supabase = createServiceRoleClient();

    const { data: workspaces, error: wErr } = await supabase
      .from('workspaces')
      .select('id, calendar_timezone');

    if (wErr || !workspaces?.length) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        message: wErr?.message ?? 'No workspaces',
      });
    }

    const wsRows = workspaces as { id: string; calendar_timezone: string }[];

    const { data: columns } = await supabase.from('board_columns').select('workspace_id, slug');
    const colByWs = new Map<string, { slug: string }[]>();
    for (const c of (columns ?? []) as { workspace_id: string; slug: string }[]) {
      const list = colByWs.get(c.workspace_id) ?? [];
      list.push({ slug: c.slug });
      colByWs.set(c.workspace_id, list);
    }

    const { data: bubbleRows } = await supabase.from('bubbles').select('id, workspace_id');
    const bubblesByWs = new Map<string, { id: string }[]>();
    for (const b of (bubbleRows ?? []) as { id: string; workspace_id: string }[]) {
      const list = bubblesByWs.get(b.workspace_id) ?? [];
      list.push({ id: b.id });
      bubblesByWs.set(b.workspace_id, list);
    }

    const batches = buildPromotionBatches(wsRows, colByWs, bubblesByWs);
    let updated = 0;

    for (const b of batches) {
      for (const part of chunk(b.bubbleIds, 80)) {
        const { data: upd, error: uErr } = await supabase
          .from('tasks')
          .update({ status: 'today' })
          .in('bubble_id', part)
          .eq('status', 'scheduled')
          .eq('scheduled_on', b.localToday)
          .select('id');
        if (uErr) {
          // Staged deploys: cron runs before migrations; avoid treating missing column as a hard failure loop.
          if (isMissingColumnSchemaCacheError(uErr, 'scheduled_on')) {
            return NextResponse.json({
              ok: true,
              tasksUpdated: updated,
              skipped: true,
              reason: 'scheduled_on_column_unavailable',
            });
          }
          continue;
        }
        if (upd?.length) updated += upd.length;
      }
    }

    return NextResponse.json({ ok: true, batches: batches.length, tasksUpdated: updated });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Cron failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
