import type { WorkoutExercise } from '@/lib/item-metadata';
import type {
  WorkoutChainMetadata,
  WorkoutSetTemplate,
} from '@/lib/workout-factory/types/ai-workout';

export interface WorkoutChainGenerationResponse {
  workoutSet: WorkoutSetTemplate;
  chain_metadata: WorkoutChainMetadata;
  /** Populated by the extract+enrich pipeline; callers can also derive from `workoutSet`. */
  taskExercises?: WorkoutExercise[];
}
