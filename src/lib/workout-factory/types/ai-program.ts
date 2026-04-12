/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared type definitions for AI Program Generation
 * Used by both the API endpoint and the Admin UI
 */

/**
 * User demographics information
 */
export interface UserDemographics {
  ageRange: string;
  sex: string;
  weight: number;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'any';
}

/**
 * Medical profile including injuries and conditions
 */
export interface MedicalProfile {
  injuries: string;
  conditions: string;
}

/**
 * User fitness goals
 */
export interface Goals {
  primary: string;
  secondary: string;
}

/**
 * Training zone information
 */
export interface TrainingZone {
  zoneId?: string;
  selectedEquipmentIds?: string[];
}

/**
 * Complete user persona for program generation (API request payload)
 */
export interface ProgramPersona {
  title?: string; // Admin-provided program title
  description?: string; // Admin-provided program description
  demographics: UserDemographics;
  medical: MedicalProfile;
  goals: Goals;
  zoneId?: string;
  selectedEquipmentIds?: string[];
  durationWeeks?: number; // Explicit duration: 6, 8, or 12 weeks
  /** Preferred training days per week (2-6). Optional. */
  daysPerWeek?: number;
}

/**
 * High-level program blueprint (Phase 1 of generation) - DEPRECATED
 * Use ArchitectBlueprint from the new 4-step chain instead.
 */
export interface ProgramBlueprint {
  program_name: string;
  rationale: string;
  structure: {
    days_per_week: number;
    split_type: string;
    session_duration_minutes: number;
  };
  /** Dynamic periodization phases based on duration, e.g., { "weeks_1_2": "Neural Adaptation", ... } */
  periodization_strategy: Record<string, string>;
  /** Weekly schedule skeleton, e.g., { "Day_1": "Lower Body - Squat Focus", ... } */
  weekly_schedule_skeleton: Record<string, string>;
}

// ============================================================================
// Scaffold (program_template) Types
// ============================================================================

/**
 * Single phase in the program scaffold (AI-decided or admin-edited).
 */
export interface PhaseScaffold {
  phaseIndex: number; // 1-based
  name: string; // e.g. "Neural Adaptation"
  weeks: number; // e.g. 2, 4, 4, 2
  focus: string; // Phase intent
  daysPerWeek?: number; // Optional override per phase
  instructions?: string; // AI instructions for Architect
}

/**
 * Program scaffold stored in programs.program_template (phase structure only).
 */
export interface ProgramTemplateScaffold {
  phases: PhaseScaffold[];
  totalWeeks: number; // Sum of phase weeks
}

/**
 * Response from generate-scaffold API.
 */
export interface ScaffoldGenerationResponse {
  scaffold: ProgramTemplateScaffold;
  programId?: string; // When program is created on scaffold generation
}

/**
 * Request for build-phase API.
 */
export interface BuildPhaseRequest {
  programId: string;
  phaseIndex: number; // 1-based
  persona: ProgramPersona;
  zoneId?: string;
  selectedEquipmentIds?: string[];
  /** Previous phase(s) workouts so the AI can build the next phase accurately (with trainer edits). */
  previousPhaseWorkouts?: ProgramSchedule[];
}

/**
 * Response from build-phase API.
 */
export interface BuildPhaseResponse {
  schedule: ProgramSchedule[];
  chain_metadata: PromptChainMetadata;
}

// ============================================================================
// 4-Step Prompt Chain Types
// ============================================================================

/**
 * Progression protocol determines how variables change week-to-week
 */
export type ProgressionProtocol = 'linear_load' | 'double_progression' | 'density_leverage';

/**
 * Volume landmark for a muscle group (MEV = Minimum Effective Volume, MRV = Maximum Recoverable Volume)
 */
export interface VolumeLandmark {
  muscle_group: string;
  mev_sets: number;
  mrv_sets: number;
}

/**
 * Step 1: Architect Blueprint
 * Establishes constraints and progression logic before picking exercises.
 */
export interface ArchitectBlueprint {
  program_name: string;
  rationale: string;
  split: {
    type: string; // "Upper/Lower", "PPL", "Full Body", "Bro Split"
    days_per_week: number;
    session_duration_minutes: number;
  };
  progression_protocol: ProgressionProtocol;
  progression_rules: {
    description: string; // Human-readable explanation of the protocol
    weeks_1_3: string; // "Accumulation: Add sets/reps"
    weeks_4_6: string; // "Intensification: Add load, reduce rest"
  };
  volume_landmarks: VolumeLandmark[];
}

/**
 * Movement pattern for biomechanical balance
 */
export interface MovementPattern {
  pattern: string; // "Horizontal Push", "Vertical Pull", "Knee Dominant", "Hip Dominant"
  category: 'compound' | 'isolation' | 'accessory';
  priority: 'primary' | 'secondary';
}

/**
 * Step 2: Pattern Skeleton (Biomechanist output)
 * Maps movement patterns to days for structural balance.
 */
export interface PatternSkeleton {
  days: {
    day_number: number;
    day_name: string; // "Upper Strength", "Lower Hypertrophy"
    patterns: MovementPattern[];
  }[];
}

/**
 * Selected exercise for a movement pattern
 */
export interface SelectedExercise {
  pattern: string; // From Step 2, e.g., "Horizontal Push"
  exercise_name: string; // Specific exercise name
  equipment_used: string;
  notes?: string;
}

/**
 * Step 3: Exercise Selection (Coach output)
 * Fills patterns with specific exercises based on equipment.
 */
export interface ExerciseSelection {
  day_number: number;
  day_name: string;
  exercises: SelectedExercise[];
}

/**
 * Complete chain metadata - stored with program for debugging/iteration
 */
export interface PromptChainMetadata {
  step1_architect: ArchitectBlueprint;
  step2_biomechanist: PatternSkeleton;
  step3_coach: ExerciseSelection[];
  generated_at: Date;
  model_used: string;
  total_tokens?: number;
}

/**
 * Response from the chain endpoint.
 * authorId is the verified admin uid so the client can set program ownership when saving.
 */
export interface ChainGenerationResponse {
  program: ProgramTemplate;
  chain_metadata: PromptChainMetadata;
  /** Verified admin uid; use as authorId when saving to library. */
  authorId: string;
}

/**
 * Zone data structure
 */
export interface ZoneData {
  id: string;
  name: string;
  description: string;
  biomechanicalConstraints: string[];
  equipmentIds: string[];
  createdAt: Date;
}

/**
 * Equipment item structure
 */
export interface EquipmentItem {
  id: string;
  name: string;
  category: 'resistance' | 'cardio' | 'utility';
}

/**
 * Program schedule structure
 */
/**
 * Warmup block: exercise name and step-by-step instructions.
 * Optional exerciseQuery links to approved exercise for mapping / View mapped.
 */
export interface WarmupBlock {
  order: number;
  exerciseName: string;
  instructions: string[];
  /** Link to approved exercise for mapping / View mapped. */
  exerciseQuery?: string;
  /** Stable id for round-trips (editor / server change tracking); optional for legacy data. */
  id?: string;
}

/**
 * Single exercise (sets, reps, RPE per exercise).
 * Used within an ExerciseBlock.
 */
// Copilot suggestion ignored: splitting strength vs timer exercises into a union would ripple through many generators and UI surfaces; optional timer fields are handled at map/validation sites instead.
export interface Exercise {
  order: number;
  exerciseName: string;
  exerciseQuery?: string;
  sets: number;
  reps: string;
  rpe?: number;
  restSeconds?: number;
  coachNotes?: string;
  /** Client-only: stable ID for React keys and DnD. Assigned during normalization. */
  id?: string;
  /** HIIT/Timer Schema: work interval in seconds (optional; when present, sets/reps may be omitted) */
  workSeconds?: number;
  /** HIIT/Timer Schema: number of rounds (optional) */
  rounds?: number;
}

/**
 * Exercise block: a group of exercises (e.g. strength block, cardio block, superset).
 * A workout contains 1+ exercise blocks; each block contains 1+ exercises.
 */
export interface ExerciseBlock {
  order?: number;
  name?: string;
  exercises: Exercise[];
  /** Client-only: stable ID for React keys and DnD. Assigned during normalization. */
  id?: string;
}

export interface ProgramSchedule {
  weekNumber: number;
  workouts: {
    title: string;
    // Breaking change: description is now required for better program quality.
    // Migration: ProgramBlueprintEditor normalizes existing programs with `description ?? ''`
    description: string;
    /** Legacy: flat list of exercises. Use exerciseBlocks when present. */
    blocks?: Exercise[];
    /** Canonical: blocks are groups of exercises (e.g. strength block, cardio block). */
    exerciseBlocks?: ExerciseBlock[];
    warmupBlocks?: WarmupBlock[];
    finisherBlocks?: WarmupBlock[];
    cooldownBlocks?: WarmupBlock[];
  }[];
}

/**
 * Program template structure (expected JSON output from AI)
 * This is the response format, without id and createdAt (added when saved to database)
 */
export interface ProgramTemplate {
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  durationWeeks: number;
  schedule: ProgramSchedule[];
}

/**
 * Admin configuration for program generation
 * Used in the Program Factory UI
 */
export interface ProgramConfig {
  programInfo: {
    title: string;
    description: string;
  };
  targetAudience: UserDemographics;
  requirements: {
    durationWeeks: 6 | 8 | 12;
    /** Preferred training days per week (2-6). Optional; AI may use when building split. */
    daysPerWeek?: number;
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
}

/**
 * Program metadata stored in master document
 */
export interface ProgramMetadata {
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  durationWeeks: number;
  targetAudience: UserDemographics;
  equipmentProfile?: {
    zoneId?: string;
    equipmentIds?: string[];
  };
  /** Optional cover/header image URL for grid cards. */
  image?: string;
  /** Goals used for generation (primary, secondary). Restored in edit mode. */
  goals?: Goals;
  /** Chain metadata from 4-step generation - for admin visibility, SEO, content generation */
  chain_metadata?: PromptChainMetadata;
  status: 'draft' | 'published';
  /** Show on astro-site homepage when true */
  featuredOnLanding?: boolean;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
}

/**
 * Week document in subcollection
 */
export interface WeekDocument {
  weekNumber: number;
  workouts: ProgramSchedule['workouts']; // Array of workouts
}

/**
 * Program library item (metadata only, for listing)
 */
export interface ProgramLibraryItem extends ProgramMetadata {
  id: string;
}

/**
 * Filters for public program catalog (equipment zone, experience level)
 */
export interface ProgramFilters {
  zoneId?: string;
  experienceLevel?: string;
}

/**
 * Public program preview (metadata + Week 1 only; Weeks 2+ never fetched)
 */
export interface ProgramPreviewData {
  metadata: ProgramMetadata & { id: string };
  previewWeek: WeekDocument;
  totalWeeks: number;
}
