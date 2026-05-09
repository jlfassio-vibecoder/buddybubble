-- Allow authenticated clients to resolve workout exercise names → exercise_dictionary rows
-- for personal cue hydration in the WorkoutPlayer (read-only; same query as service_role).

grant execute on function public.exercise_dictionary_lookup_by_names(text[]) to authenticated;
