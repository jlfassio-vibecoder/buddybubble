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
  /**
   * When true, Vertex treats task title/description as the strict Coach brief (handoff path).
   * Also inferred server-side from a long persona.description.
   */
  workout_brief_authoritative?: boolean;
  /** Apex Architect outline from tasks.metadata (Phase 3 factory handoff). */
  coach_workout_outline?: Record<string, unknown>[] | null;
};

/**
 * Authenticated Kanban extract+enrich workout generation (Vertex). Loads `fitness_profiles` for the user + workspace.
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

    if (
      body.coach_workout_outline !== undefined &&
      body.coach_workout_outline !== null &&
      !Array.isArray(body.coach_workout_outline)
    ) {
      return NextResponse.json(
        { error: 'coach_workout_outline must be an array' },
        { status: 400 },
      );
    }

    const coachWorkoutOutline =
      Array.isArray(body.coach_workout_outline) && body.coach_workout_outline.length > 0
        ? body.coach_workout_outline
        : undefined;

    if (!coachWorkoutOutline) {
      throw new Error('OUTLINE_REQUIRED_FOR_FACTORY');
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

    const personaDesc =
      typeof body.persona?.description === 'string' ? body.persona.description.trim() : '';
    const inferredBriefAuth = personaDesc.length >= 80;
    const briefAuthFlag = body.workout_brief_authoritative === true || inferredBriefAuth;

    const { persona, availableEquipmentNames } = buildBuddyWorkoutPersona({
      profile,
      overrides: body.persona,
      dailyCheckIn: body.daily_checkin ?? null,
      workoutBriefAuthoritative: briefAuthFlag,
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
      ...(coachWorkoutOutline ? { coach_workout_outline: coachWorkoutOutline } : {}),
    };

    const result = await runGenerateWorkoutChain(chainBody, shouldLog, {
      createdByUserId: user.id,
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
        { error: message || 'Generation failed' },
        { status: status || 500 },
      );
    }

    const { workoutSet, chain_metadata, taskExercises: taskExercisesFromChain } = result.data;
    const firstWorkout = workoutSet.workouts[0];
    const taskExercises =
      taskExercisesFromChain && taskExercisesFromChain.length > 0
        ? taskExercisesFromChain
        : firstWorkout
          ? workoutInSetToTaskExercises(firstWorkout)
          : [];

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
    const status = msg === 'OUTLINE_REQUIRED_FOR_FACTORY' ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
