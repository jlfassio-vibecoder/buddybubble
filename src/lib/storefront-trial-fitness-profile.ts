/**
 * Maps storefront (Astro) questionnaire JSON into `fitness_profiles` row shape.
 * Best-effort: unknown keys are ignored; defaults keep inserts valid.
 */

import type { Json, UnitSystem } from '@/types/database';

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((s) => s.trim());
}

function pickUnitSystem(raw: unknown): UnitSystem {
  if (raw === 'imperial' || raw === 'metric') return raw;
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (s === 'imperial' || s === 'us' || s === 'lbs') return 'imperial';
  return 'metric';
}

/** Max chars for freeform storefront notes stored in `biometrics` (profile JSON cap is separate). */
const MAX_STOREFRONT_WORKOUT_NOTES_STORED = 8000;

/** Only merge `biometrics` when `profile` looks like a DB row — not a raw storefront draft (avoids client-injected biometrics). */
function looksLikePersistedFitnessProfileRow(o: Record<string, unknown>): boolean {
  return (
    typeof o.workspace_id === 'string' &&
    o.workspace_id.length > 0 &&
    typeof o.user_id === 'string' &&
    o.user_id.length > 0
  );
}

/** Coerce age (years) into a coarse age_range label used by workout prompts. */
function ageToAgeRange(age: number): string {
  if (age < 18) return '18-25';
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  if (age <= 55) return '46-55';
  return '56+';
}

function parsePositiveFloat(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.trim());
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

function parsePositiveInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = Math.floor(v);
    return n > 0 ? n : null;
  }
  if (typeof v === 'string') {
    const n = parseInt(v.trim(), 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

const MAX_STOREFRONT_GOAL_LINE = 400;
const MAX_STOREFRONT_GOAL_LINES = 40;

/**
 * @returns Insert/upsert fields for `fitness_profiles`, or `null` if `profile` is not a usable object.
 */
export function mapStorefrontProfileToFitnessProfileUpsert(profile: unknown): {
  goals: string[];
  equipment: string[];
  unit_system: UnitSystem;
  biometrics: Json;
} | null {
  if (profile === undefined || profile === null) return null;
  if (typeof profile !== 'object' || Array.isArray(profile)) return null;

  const o = profile as Record<string, unknown>;

  const bio: Record<string, unknown> = {};
  const persistedBio = o.biometrics;
  if (
    looksLikePersistedFitnessProfileRow(o) &&
    persistedBio !== null &&
    typeof persistedBio === 'object' &&
    !Array.isArray(persistedBio)
  ) {
    Object.assign(bio, persistedBio as Record<string, unknown>);
  }

  let goals = strArray(o.goals);
  if (goals.length === 0 && typeof o.primary_goal === 'string' && o.primary_goal.trim()) {
    goals = [o.primary_goal.trim()];
  }
  if (goals.length === 0 && typeof o.primaryGoal === 'string' && o.primaryGoal.trim()) {
    goals = [o.primaryGoal.trim()];
  }

  const extraGoalsRaw = trimStr(o.storefront_fitness_goals_text ?? o.storefrontFitnessGoalsText);
  if (extraGoalsRaw) {
    const lines = extraGoalsRaw
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s.length > MAX_STOREFRONT_GOAL_LINE ? s.slice(0, MAX_STOREFRONT_GOAL_LINE) : s))
      .slice(0, MAX_STOREFRONT_GOAL_LINES);
    const seen = new Set(goals.map((g) => g.toLowerCase()));
    for (const line of lines) {
      const k = line.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      goals.push(line);
    }
  }

  let equipment = strArray(o.equipment);
  if (equipment.length === 0) equipment = strArray(o.equipment_available);
  if (equipment.length === 0) equipment = strArray(o.equipmentAvailable);

  const unit_system = pickUnitSystem(o.unit_system ?? o.unitSystem);

  const sbw = parsePositiveFloat(o.storefront_bio_weight ?? o.storefrontBioWeight);
  const sbh = parsePositiveFloat(o.storefront_bio_height ?? o.storefrontBioHeight);
  const sba = parsePositiveInt(o.storefront_bio_age ?? o.storefrontBioAge);
  const sbs = trimStr(o.storefront_bio_sex ?? o.storefrontBioSex);

  if (sbw != null) {
    bio.weight_kg =
      unit_system === 'imperial' ? Math.round(sbw / 2.2046226218) : Math.round(sbw * 10) / 10;
  } else {
    const wRaw = o.weight_kg ?? o.weightKg ?? o.weight;
    if (typeof wRaw === 'number' && Number.isFinite(wRaw) && wRaw > 0) {
      if (unit_system === 'imperial') {
        bio.weight_kg = Math.round(wRaw / 2.2046226218);
      } else {
        bio.weight_kg = wRaw;
      }
    }
  }

  if (sbh != null) {
    bio.height_cm =
      unit_system === 'imperial' ? Math.round(sbh * 2.54 * 10) / 10 : Math.round(sbh * 10) / 10;
  } else if (typeof o.height_cm === 'number' && o.height_cm > 0) {
    bio.height_cm = o.height_cm;
  } else if (typeof o.heightCm === 'number' && o.heightCm > 0) {
    bio.height_cm = o.heightCm;
  }

  if (sba != null && sba >= 13 && sba < 120) {
    bio.age = sba;
    bio.age_range = ageToAgeRange(sba);
  } else if (typeof o.age_range === 'string' && o.age_range.trim()) {
    bio.age_range = o.age_range.trim();
  } else if (typeof o.ageRange === 'string' && o.ageRange.trim()) {
    bio.age_range = o.ageRange.trim();
  } else if (typeof o.age === 'number' && o.age > 0 && o.age < 120) {
    bio.age_range = ageToAgeRange(Math.floor(o.age));
  }

  if (sbs) {
    bio.sex = sbs.toLowerCase().slice(0, 32);
  } else {
    const sexRaw = o.sex ?? o.gender;
    if (typeof sexRaw === 'string' && sexRaw.trim())
      bio.sex = sexRaw.trim().toLowerCase().slice(0, 32);
  }

  const exp = o.experience ?? o.experience_level ?? o.experienceLevel;
  if (exp === 'beginner' || exp === 'intermediate' || exp === 'advanced') {
    bio.experience = exp;
  }

  if (typeof o.injuries === 'string' && o.injuries.trim()) bio.injuries = o.injuries.trim();
  if (typeof o.conditions === 'string' && o.conditions.trim()) bio.conditions = o.conditions.trim();

  const intensityRaw = o.intensity_preference ?? o.intensityPreference;
  if (intensityRaw === 'lighter' || intensityRaw === 'same' || intensityRaw === 'harder') {
    bio.intensity_preference = intensityRaw;
  }

  const workoutNotes = o.storefront_workout_notes ?? o.storefrontWorkoutNotes;
  if (typeof workoutNotes === 'string' && workoutNotes.trim()) {
    const t = workoutNotes.trim();
    bio.storefront_workout_notes =
      t.length > MAX_STOREFRONT_WORKOUT_NOTES_STORED
        ? t.slice(0, MAX_STOREFRONT_WORKOUT_NOTES_STORED)
        : t;
  }

  return {
    goals,
    equipment,
    unit_system,
    biometrics: bio as Json,
  };
}
