import type { ProgramWeek } from '@/lib/item-metadata';

export type ProgramDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type ProgramTemplate = {
  id: string;
  title: string;
  goal: string;
  description: string;
  duration_weeks: number;
  difficulty: ProgramDifficulty;
  /** Weekly schedule. A single-entry array is treated as a repeating template for all weeks. */
  schedule: ProgramWeek[];
};

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: 'beginner-strength',
    title: 'Beginner Strength',
    goal: 'Build foundational strength',
    description:
      'Full-body lifts three times a week. Perfect for those new to resistance training.',
    duration_weeks: 8,
    difficulty: 'beginner',
    schedule: [
      {
        week: 1,
        days: [
          { day: 1, name: 'Full Body A', workout_type: 'Strength', duration_min: 45 },
          { day: 3, name: 'Full Body B', workout_type: 'Strength', duration_min: 45 },
          { day: 5, name: 'Full Body A', workout_type: 'Strength', duration_min: 45 },
        ],
      },
    ],
  },
  {
    id: 'couch-to-5k',
    title: 'Couch to 5K',
    goal: 'Run a 5K without stopping',
    description: 'Gradual run/walk intervals that build your aerobic base over 9 weeks.',
    duration_weeks: 9,
    difficulty: 'beginner',
    schedule: [
      {
        week: 1,
        days: [
          { day: 2, name: 'Run/Walk Intervals', workout_type: 'Cardio', duration_min: 30 },
          { day: 4, name: 'Run/Walk Intervals', workout_type: 'Cardio', duration_min: 30 },
          { day: 6, name: 'Long Run/Walk', workout_type: 'Cardio', duration_min: 35 },
        ],
      },
    ],
  },
  {
    id: 'core-flexibility',
    title: 'Core & Flexibility',
    goal: 'Improve core strength and flexibility',
    description: 'Short daily sessions combining core exercises and yoga-inspired stretching.',
    duration_weeks: 4,
    difficulty: 'beginner',
    schedule: [
      {
        week: 1,
        days: [
          { day: 1, name: 'Core Circuit', workout_type: 'Core', duration_min: 30 },
          { day: 3, name: 'Yoga Flow', workout_type: 'Flexibility', duration_min: 30 },
          { day: 5, name: 'Core + Stretch', workout_type: 'Core', duration_min: 30 },
        ],
      },
    ],
  },
  {
    id: 'hiit-fat-burn',
    title: 'HIIT Fat Burn',
    goal: 'Burn fat and improve cardiovascular fitness',
    description: 'High-intensity intervals four days per week to maximize calorie burn.',
    duration_weeks: 6,
    difficulty: 'intermediate',
    schedule: [
      {
        week: 1,
        days: [
          { day: 1, name: 'Lower Body HIIT', workout_type: 'HIIT', duration_min: 30 },
          { day: 2, name: 'Upper Body HIIT', workout_type: 'HIIT', duration_min: 30 },
          { day: 4, name: 'Full Body HIIT', workout_type: 'HIIT', duration_min: 30 },
          { day: 5, name: 'Cardio Finisher', workout_type: 'HIIT', duration_min: 30 },
        ],
      },
    ],
  },
  {
    id: 'upper-lower-split',
    title: 'Upper/Lower Split',
    goal: 'Build muscle with progressive overload',
    description:
      'Classic four-day upper/lower split designed for steady hypertrophy and strength gains.',
    duration_weeks: 8,
    difficulty: 'intermediate',
    schedule: [
      {
        week: 1,
        days: [
          { day: 1, name: 'Upper Body (Push)', workout_type: 'Strength', duration_min: 55 },
          { day: 2, name: 'Lower Body (Squat)', workout_type: 'Strength', duration_min: 55 },
          { day: 4, name: 'Upper Body (Pull)', workout_type: 'Strength', duration_min: 55 },
          { day: 5, name: 'Lower Body (Hinge)', workout_type: 'Strength', duration_min: 55 },
        ],
      },
    ],
  },
  {
    id: 'ppl-split',
    title: 'Push/Pull/Legs',
    goal: 'Maximize hypertrophy with high weekly volume',
    description:
      'Six-day PPL split hitting each muscle group twice per week for accelerated muscle growth.',
    duration_weeks: 12,
    difficulty: 'intermediate',
    schedule: [
      {
        week: 1,
        days: [
          {
            day: 1,
            name: 'Push (Chest / Shoulders / Triceps)',
            workout_type: 'Strength',
            duration_min: 60,
          },
          { day: 2, name: 'Pull (Back / Biceps)', workout_type: 'Strength', duration_min: 60 },
          { day: 3, name: 'Legs', workout_type: 'Strength', duration_min: 65 },
          { day: 4, name: 'Push (Variation)', workout_type: 'Strength', duration_min: 60 },
          { day: 5, name: 'Pull (Variation)', workout_type: 'Strength', duration_min: 60 },
          { day: 6, name: 'Legs (Variation)', workout_type: 'Strength', duration_min: 65 },
        ],
      },
    ],
  },
  {
    id: 'five-three-one',
    title: '5/3/1 Powerlifting',
    goal: 'Peak strength on squat, bench, deadlift, and press',
    description:
      "Jim Wendler's proven four-day program built around progressive overload of the four main barbell lifts.",
    duration_weeks: 12,
    difficulty: 'advanced',
    schedule: [
      {
        week: 1,
        days: [
          { day: 1, name: 'Squat', workout_type: 'Powerlifting', duration_min: 70 },
          { day: 2, name: 'Bench Press', workout_type: 'Powerlifting', duration_min: 70 },
          { day: 4, name: 'Deadlift', workout_type: 'Powerlifting', duration_min: 70 },
          { day: 5, name: 'Overhead Press', workout_type: 'Powerlifting', duration_min: 70 },
        ],
      },
    ],
  },
  {
    id: 'marathon-training',
    title: 'Marathon Training',
    goal: 'Complete a 26.2-mile marathon',
    description:
      'Sixteen-week plan with structured easy, tempo, and long runs that safely build your marathon fitness.',
    duration_weeks: 16,
    difficulty: 'advanced',
    schedule: [
      {
        week: 1,
        days: [
          { day: 1, name: 'Easy Run', workout_type: 'Cardio', duration_min: 40 },
          { day: 2, name: 'Speed / Intervals', workout_type: 'Cardio', duration_min: 50 },
          { day: 3, name: 'Tempo Run', workout_type: 'Cardio', duration_min: 45 },
          { day: 5, name: 'Easy Run', workout_type: 'Cardio', duration_min: 35 },
          { day: 6, name: 'Long Run', workout_type: 'Cardio', duration_min: 90 },
        ],
      },
    ],
  },
];
