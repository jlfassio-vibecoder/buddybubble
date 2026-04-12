import type { WorkoutExercise } from '@/lib/item-metadata';

export type PersonalizeProgramSession = {
  key: string;
  title: string;
  description: string;
  exercises: WorkoutExercise[];
};

export type PersonalizeProgramResult = {
  title_suffix: string;
  description: string;
  sessions: PersonalizeProgramSession[];
  model_used: string;
};
