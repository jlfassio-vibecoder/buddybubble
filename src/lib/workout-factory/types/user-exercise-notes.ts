/** Row shape for `public.user_exercise_notes` (personal cues per catalog exercise). */
export type UserExerciseNotesRow = {
  id: string;
  user_id: string;
  exercise_dictionary_id: string;
  instructions: string | null;
  form_cues: string | null;
  tips: string | null;
  injury_prevention_tips: string | null;
};
