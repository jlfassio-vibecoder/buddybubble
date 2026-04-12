/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI Workout Generation types (ported from Interval Timers Workout Factory).
 */

import type {
  WorkoutInSet as WorkoutInSetContract,
  WorkoutSetTemplate as WorkoutSetTemplateContract,
} from '@/lib/workout-factory/types/workout-contract';
import type {
  UserDemographics,
  MedicalProfile,
  Goals,
  ProgressionProtocol,
  VolumeLandmark,
  PatternSkeleton,
  ExerciseSelection,
  ExerciseBlock,
  Exercise,
  WarmupBlock,
} from '@/lib/workout-factory/types/ai-program';

/** Re-export for consumers. */
export type { ExerciseBlock, Exercise, WarmupBlock };

/** Split type for workout persona */
export type WorkoutSplitType =
  | 'upper_lower'
  | 'ppl'
  | 'full_body'
  | 'push_pull_legs'
  | 'bro_split'
  | 'custom';

/** Lifestyle for recovery and volume calibration */
export type WorkoutLifestyle = 'sedentary' | 'active' | 'athlete';

export type HiitProtocolFormat =
  | 'standard_ratio'
  | 'tabata'
  | 'emom'
  | 'amrap'
  | 'ladder'
  | 'chipper';

export type HiitWorkRestRatio = '1:1' | '2:1' | '1:2' | '1:3';

export interface HiitCircuitStructure {
  includeWarmup: boolean;
  circuit1: boolean;
  circuit2: boolean;
  circuit3: boolean;
  includeCooldown: boolean;
}

export type HiitSessionDurationTier = 'micro_dose' | 'standard_interval' | 'high_volume';

export type HiitPrimaryGoal = 'vo2_max' | 'lactate_tolerance' | 'explosive_power' | 'fat_oxidation';

export type AmrapDensityProtocolFormat = 'AMRAP_DENSITY';

export type AmrapDensityWorkRest = 'continuous' | '0:0';

export interface AmrapDensityOptions {
  protocolFormat: AmrapDensityProtocolFormat;
  workRestRatio: AmrapDensityWorkRest;
  sessionDurationTier: HiitSessionDurationTier;
}

export type TabataBalancedPairingPattern =
  | 'single'
  | 'antagonist_pair'
  | 'agonist_pair'
  | 'four_station'
  | 'eight_station';

export interface TabataBalancedOptions {
  pairingPattern: TabataBalancedPairingPattern;
  roundCount: number;
}

export interface HiitOptions {
  protocolFormat: HiitProtocolFormat;
  workRestRatio?: HiitWorkRestRatio;
  circuitStructure: HiitCircuitStructure;
  sessionDurationTier: HiitSessionDurationTier;
  primaryGoal: HiitPrimaryGoal;
}

export interface BlockOptions {
  includeWarmup: boolean;
  mainBlockCount: 1 | 2 | 3 | 4 | 5;
  includeFinisher: boolean;
  includeCooldown: boolean;
}

export interface WorkoutPersona {
  title?: string;
  description?: string;
  demographics: UserDemographics;
  medical: MedicalProfile;
  goals: Goals;
  zoneId?: string;
  selectedEquipmentIds?: string[];
  weeklyTimeMinutes: number;
  sessionsPerWeek: number;
  sessionDurationMinutes: number;
  splitType: WorkoutSplitType;
  lifestyle: WorkoutLifestyle;
  twoADay: boolean;
  preferredFocus?: string;
  hiitMode?: boolean;
  hiitOptions?: HiitOptions;
  amrapDensityMode?: boolean;
  amrapDensityOptions?: AmrapDensityOptions;
  tabataBalancedMode?: boolean;
  tabataBalancedOptions?: TabataBalancedOptions;
}

export interface WorkoutConfig {
  workoutInfo: {
    title: string;
    description: string;
  };
  targetAudience: UserDemographics;
  requirements: {
    sessionsPerWeek: number;
    sessionDurationMinutes: number;
    splitType: WorkoutSplitType;
    lifestyle: WorkoutLifestyle;
    twoADay: boolean;
    weeklyTimeMinutes: number;
  };
  medicalContext?: {
    includeInjuries: boolean;
    injuries?: string;
    includeConditions: boolean;
    conditions?: string;
  };
  goals: Goals;
  zoneId?: string;
  selectedEquipmentIds?: string[];
  preferredFocus?: string;
  blockOptions?: BlockOptions;
  hiitMode?: boolean;
  hiitOptions?: HiitOptions;
  amrapDensityMode?: boolean;
  amrapDensityOptions?: AmrapDensityOptions;
  tabataBalancedMode?: boolean;
  tabataBalancedOptions?: TabataBalancedOptions;
}

export interface WorkoutSessionSpec {
  session_number: number;
  session_name: string;
  focus: string;
  duration_minutes: number;
  volume_targets?: string;
}

export interface WorkoutArchitectBlueprint {
  workout_set_name: string;
  rationale: string;
  sessions: WorkoutSessionSpec[];
  split: {
    type: string;
    days_per_week: number;
    session_duration_minutes: number;
  };
  progression_protocol: ProgressionProtocol;
  progression_rules: {
    description: string;
    weeks_1_3: string;
    weeks_4_6: string;
  };
  volume_landmarks: VolumeLandmark[];
}

export interface WorkoutInSet extends WorkoutInSetContract {
  exerciseOverrides?: Record<string, Exercise>;
}

export const DEFAULT_WARMUP_BLOCKS: WarmupBlock[] = [
  {
    order: 1,
    exerciseName: 'General warm-up',
    instructions: [
      '5–10 min light cardio or dynamic stretches',
      'Prepare joints and muscles for the workout',
    ],
  },
];

export const DEFAULT_COOLDOWN_BLOCKS: WarmupBlock[] = [
  {
    order: 1,
    exerciseName: 'Cool down',
    instructions: [
      '5–10 min light activity (e.g. walking)',
      'Static stretches for major muscle groups used',
    ],
  },
];

export function ensureWarmupAndCooldown<
  T extends { warmupBlocks?: WarmupBlock[]; cooldownBlocks?: WarmupBlock[] },
>(workout: T): T {
  const w = workout as { warmupBlocks?: WarmupBlock[]; cooldownBlocks?: WarmupBlock[] };
  if (!w.warmupBlocks || w.warmupBlocks.length === 0) {
    w.warmupBlocks = [...DEFAULT_WARMUP_BLOCKS];
  }
  if (!w.cooldownBlocks || w.cooldownBlocks.length === 0) {
    w.cooldownBlocks = [...DEFAULT_COOLDOWN_BLOCKS];
  }
  return workout;
}

export interface HIITTimelineBlock {
  type: 'warmup' | 'work' | 'rest' | 'cooldown';
  duration: number;
  name: string;
  notes?: string;
  imageUrl?: string;
}

export type HIITTargetGoal = 'VO2' | 'Lactate' | 'Power' | 'FatOx';

export interface HIITWorkoutData {
  meta: {
    title: string;
    protocol: string;
    description: string;
    targetGoal: HIITTargetGoal;
    durationMin?: number;
  };
  science: {
    title: string;
    summary: string;
    benefit1: string;
    benefit2: string;
  };
  timeline: HIITTimelineBlock[];
}

export interface WorkoutSetTemplate extends Omit<WorkoutSetTemplateContract, 'workouts'> {
  workouts: WorkoutInSet[];
}

export interface WorkoutMetadata {
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  targetAudience: UserDemographics;
  equipmentProfile?: {
    zoneId?: string;
    equipmentIds?: string[];
  };
  goals?: Goals;
  workoutConfig?: WorkoutConfig;
  chain_metadata?: WorkoutChainMetadata;
  status: 'draft' | 'published';
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  workoutCount?: number;
}

export interface WorkoutChainMetadata {
  step1_workout_architect: WorkoutArchitectBlueprint;
  step2_biomechanist: PatternSkeleton;
  step3_coach: ExerciseSelection[];
  step4_workout_mathematician: WorkoutInSet[];
  generated_at: string;
  model_used: string;
  total_tokens?: number;
}

export interface WorkoutLibraryItem extends WorkoutMetadata {
  id: string;
}
