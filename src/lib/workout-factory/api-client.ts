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

export class WorkoutFactoryError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly validationError?: string;
  readonly failureKind?: 'validation' | 'parse';
  readonly validationReason?: 'structure' | 'prescription' | 'parse' | 'unknown';

  constructor(
    message: string,
    opts?: {
      code?: string;
      status?: number;
      validationError?: string;
      failureKind?: 'validation' | 'parse';
      validationReason?: 'structure' | 'prescription' | 'parse' | 'unknown';
    },
  ) {
    super(message);
    this.name = 'WorkoutFactoryError';
    this.code = opts?.code;
    this.status = opts?.status;
    this.validationError = opts?.validationError;
    this.failureKind = opts?.failureKind;
    this.validationReason = opts?.validationReason;
  }
}

export function workoutFactoryErrorMessage(err: WorkoutFactoryError): {
  message: string;
  showRegenerate: boolean;
} {
  if (err.status === 422) {
    if (err.validationReason === 'structure') {
      return {
        message:
          'Generation hit a structure mismatch. Confirm structure or edit blocks, then try again.',
        showRegenerate: true,
      };
    }
    if (err.failureKind === 'parse' || err.validationReason === 'parse') {
      return {
        message:
          "We had trouble reading the AI's response format. Please try generating the workout again.",
        showRegenerate: true,
      };
    }
    return {
      message: "AI couldn't finish exercise prescriptions. Your structure looks fine — try again.",
      showRegenerate: true,
    };
  }
  return { message: err.message, showRegenerate: false };
}

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
  task_id?: string;
  persona?: Partial<WorkoutPersona>;
  daily_checkin?: Record<string, unknown> | null;
  blockOptions?: BlockOptions;
  /** Task modal / Coach card: title+description are the prescription brief for Vertex. */
  workout_brief_authoritative?: boolean;
  /** Apex Architect outline from tasks.metadata; Phase 3 factory handoff. */
  coach_workout_outline?: Record<string, unknown>[] | null;
}): Promise<GenerateWorkoutChainResponse> {
  const res = await fetch('/api/ai/generate-workout-chain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      validation_error?: string;
      failure_kind?: 'validation' | 'parse';
      validation_reason?: 'structure' | 'prescription' | 'parse' | 'unknown';
    };
    const msg = data.message || data.error || res.statusText || 'Failed to generate workout';
    if (res.status === 422) {
      throw new WorkoutFactoryError(msg, {
        code: data.error,
        status: res.status,
        validationError: data.validation_error,
        failureKind: data.failure_kind,
        validationReason: data.validation_reason,
      });
    }
    throw new Error(msg);
  }
  return res.json() as Promise<GenerateWorkoutChainResponse>;
}

export const WORKOUT_FACTORY_CHAIN_MESSAGES = [
  'Step 1/4: Designing workout structure…',
  'Step 2/4: Mapping movement patterns…',
  'Step 3/4: Selecting exercises…',
  'Step 4/4: Writing prescriptions…',
] as const;
