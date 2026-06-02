-- EMOM Slap Target: per-set active period (seconds to complete reps in a minute).

begin;

alter table public.workout_exercise_logs
  add column if not exists active_seconds integer
  check (active_seconds is null or active_seconds >= 0);

comment on column public.workout_exercise_logs.active_seconds is
  'EMOM per-set active period: seconds athlete took to finish reps in the minute (Slap Target).';

commit;
