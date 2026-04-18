/**
 * Builds WorkoutPersona + equipment list from BuddyBubble fitness_profiles and optional check-in payload.
 */

import type { FitnessProfileRow } from '@/types/database';
import type {
  WorkoutPersona,
  WorkoutSplitType,
  WorkoutLifestyle,
} from '@/lib/workout-factory/types/ai-workout';
import type {
  UserDemographics,
  Goals,
  MedicalProfile,
} from '@/lib/workout-factory/types/ai-program';

export type BuddyBiometrics = {
  age_range?: string;
  sex?: string;
  weight_kg?: number;
  experience?: 'beginner' | 'intermediate' | 'advanced';
  injuries?: string;
  conditions?: string;
};

function parseBiometrics(raw: unknown): BuddyBiometrics {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const exp = o.experience;
  const experience =
    exp === 'beginner' || exp === 'intermediate' || exp === 'advanced' ? exp : undefined;
  return {
    age_range: typeof o.age_range === 'string' ? o.age_range : undefined,
    sex: typeof o.sex === 'string' ? o.sex : undefined,
    weight_kg: typeof o.weight_kg === 'number' ? o.weight_kg : undefined,
    experience,
    injuries: typeof o.injuries === 'string' ? o.injuries : undefined,
    conditions: typeof o.conditions === 'string' ? o.conditions : undefined,
  };
}

/** `UserDemographics.weight` is consumed in prompts as pounds (see architect prompts). */
function kgToLbs(kg: number): number {
  return Math.round(kg * 2.2046226218);
}

function demographicsFromProfile(profile: FitnessProfileRow | null): UserDemographics {
  const b = parseBiometrics(profile?.biometrics);
  return {
    ageRange: b.age_range ?? '30-39',
    sex: b.sex ?? 'any',
    weight: typeof b.weight_kg === 'number' && b.weight_kg > 0 ? kgToLbs(b.weight_kg) : kgToLbs(75),
    experienceLevel: b.experience ?? 'intermediate',
  };
}

function goalsFromProfile(profile: FitnessProfileRow | null): Goals {
  const g = profile?.goals ?? [];
  return {
    primary: g[0] ?? 'General fitness',
    secondary: g[1] ?? '',
  };
}

function medicalFromProfile(profile: FitnessProfileRow | null): MedicalProfile {
  const b = parseBiometrics(profile?.biometrics);
  return {
    injuries: b.injuries ?? '',
    conditions: b.conditions ?? '',
  };
}

export interface BuildBuddyWorkoutPersonaParams {
  profile: FitnessProfileRow | null;
  /** Optional client-provided overrides (task title, duration, split, etc.) */
  overrides?: Partial<WorkoutPersona>;
  /** Recent check-in or readiness — merged into description for the architect */
  dailyCheckIn?: Record<string, unknown> | null;
  /**
   * When true, task title/description are the Coach-approved brief for Vertex (not profile-driven).
   * May also be inferred from a long `overrides.description`.
   */
  workoutBriefAuthoritative?: boolean;
}

/**
 * Default single-session Kanban workout: one session in the chain, full-body, moderate duration.
 */
const MIN_DESCRIPTION_CHARS_FOR_INFERRED_BRIEF_AUTH = 80;

export function buildBuddyWorkoutPersona(params: BuildBuddyWorkoutPersonaParams): {
  persona: WorkoutPersona;
  availableEquipmentNames: string[];
} {
  const { profile, overrides, dailyCheckIn, workoutBriefAuthoritative } = params;

  const demographics = overrides?.demographics ?? demographicsFromProfile(profile);
  const goals = overrides?.goals ?? goalsFromProfile(profile);
  const medical = overrides?.medical ?? medicalFromProfile(profile);

  const descTrim = overrides?.description?.trim() ?? '';
  const titleTrim = overrides?.title?.trim() ?? '';
  const inferredBriefAuth =
    descTrim.length >= MIN_DESCRIPTION_CHARS_FOR_INFERRED_BRIEF_AUTH ||
    (titleTrim.length > 0 && descTrim.length >= 40);
  const briefAuthoritative =
    workoutBriefAuthoritative === true ||
    overrides?.kanbanBriefAuthoritative === true ||
    inferredBriefAuth;

  const equipmentFromProfile = profile?.equipment?.length ? [...profile.equipment] : ['Bodyweight'];
  /** When Coach Kanban brief drives generation, do not inject profile inventory into Vertex. */
  const equipment = briefAuthoritative
    ? [
        'Use ONLY equipment, modalities, and constraints explicitly stated or clearly implied in the WORKOUT BRIEF (Title + Description). Do not substitute barbell/rack/cable defaults unless the brief implies them.',
      ]
    : equipmentFromProfile;

  const sessionDuration =
    overrides?.sessionDurationMinutes ??
    (typeof dailyCheckIn?.target_duration_min === 'number' ? dailyCheckIn.target_duration_min : 45);
  const sessionsPerWeek = overrides?.sessionsPerWeek ?? 3;
  const weeklyTimeMinutes = overrides?.weeklyTimeMinutes ?? sessionDuration * sessionsPerWeek;

  let description = overrides?.description ?? '';
  if (dailyCheckIn && Object.keys(dailyCheckIn).length > 0) {
    const checkInText = JSON.stringify(dailyCheckIn);
    description = [description.trim(), `Daily check-in context: ${checkInText}`]
      .filter(Boolean)
      .join('\n\n');
  }

  const persona: WorkoutPersona = {
    title: overrides?.title,
    description: description || undefined,
    demographics,
    medical,
    goals,
    weeklyTimeMinutes,
    sessionsPerWeek,
    sessionDurationMinutes: sessionDuration,
    splitType: (overrides?.splitType as WorkoutSplitType | undefined) ?? 'full_body',
    lifestyle: (overrides?.lifestyle as WorkoutLifestyle | undefined) ?? 'active',
    twoADay: overrides?.twoADay ?? false,
    preferredFocus: overrides?.preferredFocus,
    hiitMode: overrides?.hiitMode,
    hiitOptions: overrides?.hiitOptions,
    amrapDensityMode: overrides?.amrapDensityMode,
    amrapDensityOptions: overrides?.amrapDensityOptions,
    tabataBalancedMode: overrides?.tabataBalancedMode,
    tabataBalancedOptions: overrides?.tabataBalancedOptions,
    ...(briefAuthoritative ? { kanbanBriefAuthoritative: true as const } : {}),
  };

  return {
    persona,
    availableEquipmentNames: equipment,
  };
}
