import { NextResponse } from 'next/server';
import { createClient } from '@utils/supabase/server';
import { buildBuddyWorkoutPersona } from '@/lib/workout-factory/buddy-persona';
import { runGenerateWorkoutChain } from '@/lib/workout-factory/generate-workout-chain-runner';
import { workoutInSetToTaskExercises } from '@/lib/workout-factory/map-ai-workout-to-task-exercises';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';
import type { BlockOptions } from '@/lib/workout-factory/types/ai-workout';
import type { FitnessProfileRow } from '@/types/database';

export const maxDuration = 300;

type RequestBody = {
  workspace_id: string;
  /** Merged into persona after profile defaults (optional). */
  persona?: Partial<WorkoutPersona>;
  /** Daily check-in / readiness — JSON forwarded into architect context. */
  daily_checkin?: Record<string, unknown> | null;
  blockOptions?: BlockOptions;
};

/**
 * Authenticated 4-step workout generation (Vertex). Loads `fitness_profiles` for the user + workspace.
 */
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

    const { data: profileRow, error: profileError } = await supabase
      .from('fitness_profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[generate-workout-chain] fitness_profiles:', profileError);
      return NextResponse.json({ error: 'Could not load fitness profile' }, { status: 500 });
    }

    const profile = profileRow as FitnessProfileRow | null;

    const { persona, availableEquipmentNames } = buildBuddyWorkoutPersona({
      profile,
      overrides: body.persona,
      dailyCheckIn: body.daily_checkin ?? null,
    });

    const chainBody: Record<string, unknown> = {
      ...persona,
      availableEquipmentNames,
      blockOptions: body.blockOptions ?? {
        includeWarmup: true,
        mainBlockCount: 1,
        includeFinisher: false,
        includeCooldown: false,
      },
    };

    const result = await runGenerateWorkoutChain(chainBody, shouldLog);
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
        { error: message || 'Generation failed' },
        { status: status || 500 },
      );
    }

    const { workoutSet, chain_metadata } = result.data;
    const firstWorkout = workoutSet.workouts[0];
    const taskExercises = firstWorkout ? workoutInSetToTaskExercises(firstWorkout) : [];

    return NextResponse.json({
      workoutSet,
      chain_metadata,
      taskExercises,
      suggestedTitle: workoutSet.title,
      suggestedDescription: workoutSet.description,
    });
  } catch (e) {
    console.error('[generate-workout-chain]', e);
    const msg = e instanceof Error ? e.message : 'Failed to generate workout';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
