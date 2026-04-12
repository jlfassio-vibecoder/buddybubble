import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { asProgramSchedule } from '@/lib/item-metadata';
import { buildBuddyWorkoutPersona } from '@/lib/workout-factory/buddy-persona';
import { runPersonalizeProgram } from '@/lib/workout-factory/run-personalize-program';
import type { FitnessProfileRow } from '@/types/database';

export const maxDuration = 300;

type ProgramPayload = {
  base_title: string;
  goal: string;
  duration_weeks: number;
  schedule: unknown;
};

type RequestBody = {
  workspace_id: string;
  program: ProgramPayload;
};

export async function POST(req: Request) {
  const shouldLog = process.env.NODE_ENV === 'development';

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : '';
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspace_id is required' }, { status: 400 });
    }

    const prog = body.program;
    if (!prog || typeof prog !== 'object') {
      return NextResponse.json({ error: 'program is required' }, { status: 400 });
    }

    const baseTitle = typeof prog.base_title === 'string' ? prog.base_title.trim() : '';
    const goal = typeof prog.goal === 'string' ? prog.goal.trim() : '';
    const durationWeeks =
      typeof prog.duration_weeks === 'number' && Number.isFinite(prog.duration_weeks)
        ? prog.duration_weeks
        : parseInt(String(prog.duration_weeks ?? ''), 10);
    const schedule = asProgramSchedule(prog.schedule);

    if (!baseTitle) {
      return NextResponse.json({ error: 'program.base_title is required' }, { status: 400 });
    }
    if (!Number.isFinite(durationWeeks) || durationWeeks < 1) {
      return NextResponse.json(
        { error: 'program.duration_weeks must be a positive number' },
        { status: 400 },
      );
    }

    const { data: profileRow, error: profileError } = await supabase
      .from('fitness_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[personalize-program] fitness_profiles:', profileError);
      return NextResponse.json({ error: 'Could not load fitness profile' }, { status: 500 });
    }

    const profile = profileRow as FitnessProfileRow | null;

    const { persona, availableEquipmentNames } = buildBuddyWorkoutPersona({
      profile,
      overrides: undefined,
      dailyCheckIn: null,
    });

    const result = await runPersonalizeProgram({
      baseTitle,
      goal,
      durationWeeks,
      schedule,
      persona,
      equipmentNames: availableEquipmentNames,
      shouldLog,
    });

    if (!result.ok) {
      const errText = await result.response.text();
      let status = result.response.status;
      let message = errText;
      try {
        const j = JSON.parse(errText) as { error?: string };
        if (j?.error) message = j.error;
      } catch {
        // use raw
      }
      return NextResponse.json(
        { error: message || 'Personalization failed' },
        { status: status || 500 },
      );
    }

    const { title_suffix, description, sessions, model_used } = result.data;
    const generated_at = new Date().toISOString();

    return NextResponse.json({
      title_suffix,
      description,
      sessions,
      model_used,
      generated_at,
    });
  } catch (e) {
    console.error('[personalize-program]', e);
    const msg = e instanceof Error ? e.message : 'Failed to personalize program';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
