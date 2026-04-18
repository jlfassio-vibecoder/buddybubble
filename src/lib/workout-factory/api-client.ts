import type { ProgramWeek, WorkoutExercise } from '@/lib/item-metadata';
import type {
  BlockOptions,
  WorkoutChainMetadata,
  WorkoutPersona,
  WorkoutSetTemplate,
} from '@/lib/workout-factory/types/ai-workout';
import type { PersonalizeProgramSession } from '@/lib/workout-factory/types/personalize-program';

export interface GenerateWorkoutChainResponse {
  workoutSet: WorkoutSetTemplate;
  chain_metadata: WorkoutChainMetadata;
  taskExercises: WorkoutExercise[];
  suggestedTitle: string;
  suggestedDescription: string;
}

export type PersonalizeProgramResponse = {
  title_suffix: string;
  description: string;
  sessions: PersonalizeProgramSession[];
  model_used: string;
  generated_at: string;
};

export async function postPersonalizeProgram(body: {
  workspace_id: string;
  program: {
    base_title: string;
    goal: string;
    duration_weeks: number;
    schedule: ProgramWeek[];
  };
}): Promise<PersonalizeProgramResponse> {
  const res = await fetch('/api/ai/personalize-program', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || res.statusText || 'Failed to personalize program');
  }
  return res.json() as Promise<PersonalizeProgramResponse>;
}

export async function postGenerateWorkoutChain(body: {
  workspace_id: string;
  persona?: Partial<WorkoutPersona>;
  daily_checkin?: Record<string, unknown> | null;
  blockOptions?: BlockOptions;
  /** Task modal / Coach card: title+description are the prescription brief for Vertex. */
  workout_brief_authoritative?: boolean;
}): Promise<GenerateWorkoutChainResponse> {
  const res = await fetch('/api/ai/generate-workout-chain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || res.statusText || 'Failed to generate workout');
  }
  return res.json() as Promise<GenerateWorkoutChainResponse>;
}

export const WORKOUT_FACTORY_CHAIN_MESSAGES = [
  'Step 1/4: Designing workout structure…',
  'Step 2/4: Mapping movement patterns…',
  'Step 3/4: Selecting exercises…',
  'Step 4/4: Writing prescriptions…',
] as const;
