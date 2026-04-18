import type { WorkoutExercise } from '@/lib/item-metadata';
import type {
  WorkoutChainMetadata,
  WorkoutSetTemplate,
} from '@/lib/workout-factory/types/ai-workout';

export interface WorkoutChainGenerationResponse {
  workoutSet: WorkoutSetTemplate;
  chain_metadata: WorkoutChainMetadata;
  /** Populated by Kanban extract path; legacy callers derive from `workoutSet`. */
  taskExercises?: WorkoutExercise[];
}
