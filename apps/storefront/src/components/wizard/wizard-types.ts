export type WizardPhase = 'idle' | 'profile' | 'outline' | 'refine' | 'email' | 'loading';

export type UnitSystem = 'metric' | 'imperial';
export type IntensityPreference = 'lighter' | 'same' | 'harder';

/**
 * Storefront wizard draft payload.
 *
 * CRITICAL: This must remain a **flat** object shape that matches the CRM intake contract
 * (`POST /api/leads/storefront-trial`), which accepts `profile: unknown` and relies on
 * known keys (no nested `refineData`).
 */
export interface StorefrontProfileDraft {
  // ---------------------------------------------------------------------------
  // Phase 2 — Profile (questionnaire)
  // ---------------------------------------------------------------------------
  primary_goal?: string;
  experience_level?: 'beginner' | 'intermediate' | 'advanced' | string;
  equipment?: string[];
  unit_system?: UnitSystem;

  // Business profile fields (kept generic; backend stores as JSON metadata)
  company_size?: string;
  focus_area?: string;
  timeline?: string;

  // ---------------------------------------------------------------------------
  // Phase 4 — Refine (MUST be flat keys)
  // ---------------------------------------------------------------------------
  intensity_preference?: IntensityPreference;
  storefront_workout_notes?: string;

  storefront_bio_weight?: string; // numeric string in UI, coerced in mapping
  storefront_bio_height?: string; // numeric string in UI, coerced in mapping
  storefront_bio_age?: string; // numeric string in UI, coerced in mapping
  storefront_bio_sex?: 'female' | 'male' | 'other' | 'prefer_not_to_say' | string;

  storefront_fitness_goals_text?: string; // newline-delimited goals

  // ---------------------------------------------------------------------------
  // Optional identity helpers (some flows derive display name from these)
  // ---------------------------------------------------------------------------
  display_name?: string;
  displayName?: string;
  name?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;

  // Allow forward-compatible additions without forcing UI rewrites.
  [key: string]: unknown;
}
