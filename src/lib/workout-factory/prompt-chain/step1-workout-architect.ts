/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step 1: The Workout Architect
 * Establishes 1–N sessions (single, split, or two-a-day) and progression logic.
 * Output shape is compatible with Biomechanist/Coach (split, volume_landmarks).
 */

import type {
  WorkoutPersona,
  WorkoutArchitectBlueprint,
  HiitOptions,
  AmrapDensityOptions,
  TabataBalancedOptions,
} from '@/lib/workout-factory/types/ai-workout';
import { tabataBalancedSessionMinutes } from '@/lib/workout-factory/tabata-balanced-duration';
import type { ProgressionProtocol } from '@/lib/workout-factory/types/ai-program';

interface ZoneContext {
  zoneName: string;
  availableEquipment: string[];
  biomechanicalConstraints: string[];
}

function buildAmrapDensityArchitectSection(
  sessionDurationMinutes: number,
  opts: AmrapDensityOptions,
): string {
  return `
=== DENSITY-BASED AMRAP ===
Protocol: ${opts.protocolFormat}. Movement cadence: ${opts.workRestRatio} (continuous density; no timed stations between movements).
Fixed session clock: ${sessionDurationMinutes} minutes. Tier key: ${opts.sessionDurationTier}.

Prescribe structure only: repeating lap format with fixed repetition targets per station (details appear in a later chain step). Do not use interval-timing vocabulary or timed station blocks in this blueprint. Warm-up and cool-down are delivered outside this generated programming.

You MUST set progression_protocol to "density_leverage" (e.g. more total laps completed over ~6 weeks). In progression_rules, contrast weeks 1–3 vs 4–6 using lap density.

volume_landmarks: derive weekly set-equivalents from estimated laps × stations × reps for 15 or 20 minute windows where applicable; keep MEV/MRV numeric and muscle-group scoped.
`;
}

function buildTabataBalancedArchitectSection(
  sessionDurationMinutes: number,
  opts: TabataBalancedOptions,
): string {
  const patternLabel: Record<TabataBalancedOptions['pairingPattern'], string> = {
    single:
      'Single exercise (all work intervals on one movement — hardest; scale load or regression as needed)',
    antagonist_pair:
      'Antagonist pair (push/pull): alternate two movements across work intervals for balance and recovery',
    agonist_pair:
      'Same-muscle pair (two different exercises for the same pattern): alternate for local endurance',
    four_station:
      'Four exercises: rotate through all four in order, repeating until rounds complete',
    eight_station: 'Eight exercises: one distinct exercise per work interval (full rotation)',
  };
  return `
=== BALANCED STRENGTH & CARDIO TABATA ===
Fixed interval: 20 seconds work / 10 seconds rest (classic Tabata timing). Main block duration: ${sessionDurationMinutes} minutes total (rounds × 30s; no separate warmup/cooldown in this blueprint).
Pairing: ${opts.pairingPattern}. ${patternLabel[opts.pairingPattern]}
Total work intervals (rounds): ${opts.roundCount}. Default 8 is the widely used research reference; progression can adjust load, tempo, or movement quality.

You MUST set progression_protocol to "double_progression" (e.g. add load or harder variation when reps/quality targets are met across weeks). In progression_rules, contrast weeks 1–3 vs 4–6 using power output and movement quality.

volume_landmarks: include muscle groups hit by the pairing (MEV/MRV set-equivalents per week) so the Biomechanist balances push/pull or regional work.
`;
}

/**
 * Build the prompt for Step 1: The Workout Architect
 */
export function buildWorkoutArchitectPrompt(
  persona: WorkoutPersona,
  zoneContext?: ZoneContext,
  hiitOptions?: HiitOptions,
): string {
  const {
    title,
    description,
    demographics,
    medical,
    goals,
    weeklyTimeMinutes,
    sessionsPerWeek,
    sessionDurationMinutes,
    splitType,
    lifestyle,
    twoADay,
    preferredFocus,
  } = persona;

  const circuitInstruction = !hiitOptions
    ? ''
    : hiitOptions.protocolFormat === 'amrap'
      ? `AMRAP: Interval-only prescription. Sessions are a single repeating circuit for a fixed duration (as many laps as possible). Do NOT describe warmup, cool-down, or non-work content in the blueprint—trainers/hosts deliver those outside generated programming.`
      : `Circuit Structure: Warmup=${hiitOptions.circuitStructure.includeWarmup}, Circuit 1 (Driver)=${hiitOptions.circuitStructure.circuit1}, Circuit 2 (Sustainer)=${hiitOptions.circuitStructure.circuit2}, Circuit 3 (Burnout)=${hiitOptions.circuitStructure.circuit3}, Cool Down=${hiitOptions.circuitStructure.includeCooldown}`;

  const hiitSection =
    hiitOptions &&
    !persona.amrapDensityMode &&
    !persona.tabataBalancedMode &&
    `
=== METABOLIC CONDITIONING (HIIT) MODE ===
Design interval-based sessions using density and time, not sets/reps.

Protocol Format: ${hiitOptions.protocolFormat}
${hiitOptions.workRestRatio ? `Work:Rest Ratio: ${hiitOptions.workRestRatio}` : ''}
${circuitInstruction}
Session Duration Tier: ${hiitOptions.sessionDurationTier} (keep duration_minutes within 4–30)
Primary Focus: ${hiitOptions.primaryGoal}

Output sessions with duration_minutes in the HIIT range (4–30). progression_protocol can be density_leverage. volume_landmarks can emphasize energy systems or time under tension where relevant.
`;

  const amrapDensityOpts = persona.amrapDensityOptions;
  const amrapDensitySection =
    persona.amrapDensityMode && amrapDensityOpts
      ? buildAmrapDensityArchitectSection(persona.sessionDurationMinutes, amrapDensityOpts)
      : '';

  const tabataOpts = persona.tabataBalancedOptions;
  const tabataBalancedSection =
    persona.tabataBalancedMode && tabataOpts
      ? buildTabataBalancedArchitectSection(persona.sessionDurationMinutes, tabataOpts)
      : '';

  const equipmentSection = zoneContext
    ? `
Equipment Zone: ${zoneContext.zoneName}
Available Equipment: ${zoneContext.availableEquipment.join(', ')}
Biomechanical Constraints: ${zoneContext.biomechanicalConstraints.join(', ')}`
    : '';

  const medicalSection =
    medical.injuries || medical.conditions
      ? `
Medical Context:
${medical.injuries ? `- Injuries: ${medical.injuries}` : ''}
${medical.conditions ? `- Conditions: ${medical.conditions}` : ''}`
      : '';

  const focusSection = preferredFocus
    ? `\nPreferred focus for single session: ${preferredFocus}`
    : '';

  return `Role: You are the Workout Architect (PhD Exercise Physiology).
Task: Design a single set of 1–N training sessions (no week-by-week program). Each session is a complete workout. Respect the user's time and split preferences.

=== USER PROFILE ===
Title: ${title || '(Auto-generate)'}
Description: ${description || '(Auto-generate based on goals)'}

Demographics:
- Age Range: ${demographics.ageRange}
- Sex: ${demographics.sex}
- Weight: ${demographics.weight} lbs
- Experience Level: ${demographics.experienceLevel}
${medicalSection}

Goals:
- Primary: ${goals.primary}
- Secondary: ${goals.secondary}

Workout constraints:
- Weekly time available: ${weeklyTimeMinutes} minutes
- Sessions per week: ${sessionsPerWeek}
- Session duration (target): ${sessionDurationMinutes} minutes
- Split type: ${splitType}
- Lifestyle: ${lifestyle}
- Two-a-day allowed: ${twoADay}
${focusSection}
${equipmentSection}
${hiitSection ?? ''}
${amrapDensitySection}
${tabataBalancedSection}

=== YOUR TASK ===
1. Decide how many distinct sessions to create (1 to ${sessionsPerWeek}). For splits, e.g. 2 (Upper/Lower), 3 (PPL), 4 (Upper/Lower x2). For single session, output 1.
2. For each session: session_number, session_name, focus, duration_minutes. Optionally volume_targets (e.g. "MEV for chest").
3. Choose progression_protocol: linear_load, double_progression, or density_leverage (same definitions as program architect).${persona.amrapDensityMode ? ' For Density-Based AMRAP you MUST use density_leverage (progress total laps / density over ~6 weeks).' : ''}${persona.tabataBalancedMode ? ' For Balanced Tabata you MUST use double_progression.' : ''}
4. Output split object: type (string), days_per_week (number of sessions), session_duration_minutes.
5. Output volume_landmarks for muscle groups (MEV/MRV sets per week) so the Biomechanist can balance patterns.${persona.amrapDensityMode ? ' For 15 or 20 minute density windows, estimate plausible laps per session from movement complexity, then derive weekly set-equivalent volume from (estimated laps × reps × stations × sessions per week).' : ''}${persona.tabataBalancedMode ? ' For Tabata, anchor volume to the work intervals and pairing (push/pull vs single-limb, etc.).' : ''}

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown, no explanations. Start with { and end with }.

{
  "workout_set_name": "Short name for this workout set",
  "rationale": "One sentence why this session design fits the user.",
  "sessions": [
    { "session_number": 1, "session_name": "Upper Strength", "focus": "Horizontal push/pull, vertical push/pull", "duration_minutes": 45 },
    { "session_number": 2, "session_name": "Lower + Core", "focus": "Knee/hip dominant, core", "duration_minutes": 45 }
  ],
  "split": {
    "type": "Upper/Lower or PPL or Full Body etc.",
    "days_per_week": 2,
    "session_duration_minutes": 45
  },
  "progression_protocol": "linear_load or double_progression or density_leverage",
  "progression_rules": {
    "description": "How to progress within or across sessions",
    "weeks_1_3": "Accumulation focus",
    "weeks_4_6": "Intensification focus"
  },
  "volume_landmarks": [
    { "muscle_group": "Chest", "mev_sets": 6, "mrv_sets": 12 },
    { "muscle_group": "Quads", "mev_sets": 6, "mrv_sets": 14 }
  ]
}

Generate exactly the number of sessions that fit the user's sessionsPerWeek and splitType.`;
}

/**
 * Validate Step 1 Workout Architect output
 * @param hiitMode - When true, allow session duration_minutes >= 4 (HIIT caps)
 * @param amrapDensityMode - Density-Based AMRAP: enforce density_leverage, tier minutes, volume_landmarks
 * @param tabataBalancedMode - Balanced Tabata: enforce double_progression, fixed session minutes from rounds
 */
export function validateWorkoutArchitectOutput(
  data: unknown,
  hiitMode?: boolean,
  amrapDensityMode?: boolean,
  tabataBalancedMode?: boolean,
  tabataBalancedOptions?: TabataBalancedOptions,
): { valid: true; data: WorkoutArchitectBlueprint } | { valid: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Workout architect output must be an object' };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.workout_set_name !== 'string' || !obj.workout_set_name.trim()) {
    return { valid: false, error: 'workout_set_name is required' };
  }

  if (typeof obj.rationale !== 'string' || !obj.rationale.trim()) {
    return { valid: false, error: 'rationale is required' };
  }

  if (!Array.isArray(obj.sessions) || obj.sessions.length < 1 || obj.sessions.length > 7) {
    return { valid: false, error: 'sessions must be an array of 1–7 items' };
  }

  const firstDurations: number[] = [];
  for (let i = 0; i < obj.sessions.length; i++) {
    const s = obj.sessions[i] as Record<string, unknown>;
    if (typeof s.session_number !== 'number') {
      return { valid: false, error: `sessions[${i}].session_number is required` };
    }
    if (typeof s.session_name !== 'string' || !s.session_name.trim()) {
      return { valid: false, error: `sessions[${i}].session_name is required` };
    }
    if (typeof s.focus !== 'string' || !s.focus.trim()) {
      return { valid: false, error: `sessions[${i}].focus is required` };
    }
    if (amrapDensityMode) {
      const dm = s.duration_minutes;
      if (typeof dm !== 'number' || (dm !== 5 && dm !== 15 && dm !== 20)) {
        return {
          valid: false,
          error: `sessions[${i}].duration_minutes must be 5, 15, or 20 for Density-Based AMRAP`,
        };
      }
      firstDurations.push(dm);
    } else if (tabataBalancedMode && tabataBalancedOptions) {
      const expected = tabataBalancedSessionMinutes(tabataBalancedOptions.roundCount);
      const dm = s.duration_minutes;
      if (typeof dm !== 'number' || dm !== expected) {
        return {
          valid: false,
          error: `sessions[${i}].duration_minutes must be ${expected} for Balanced Tabata (main block)`,
        };
      }
      firstDurations.push(dm);
    } else {
      const minDuration = hiitMode ? 4 : 10;
      if (typeof s.duration_minutes !== 'number' || s.duration_minutes < minDuration) {
        return {
          valid: false,
          error: `sessions[${i}].duration_minutes must be at least ${minDuration}`,
        };
      }
    }
  }

  if ((amrapDensityMode || tabataBalancedMode) && firstDurations.length > 0) {
    const first = firstDurations[0];
    if (!firstDurations.every((d) => d === first)) {
      return {
        valid: false,
        error: `All sessions must use the same duration_minutes for ${amrapDensityMode ? 'Density-Based AMRAP' : 'Balanced Tabata'}`,
      };
    }
  }

  if (typeof obj.split !== 'object' || obj.split === null) {
    return { valid: false, error: 'split object is required' };
  }

  const split = obj.split as Record<string, unknown>;
  if (typeof split.type !== 'string' || !split.type.trim()) {
    return { valid: false, error: 'split.type is required' };
  }
  if (
    typeof split.days_per_week !== 'number' ||
    split.days_per_week < 1 ||
    split.days_per_week > 7
  ) {
    return { valid: false, error: 'split.days_per_week must be between 1 and 7' };
  }
  const minSplitDuration =
    tabataBalancedMode && tabataBalancedOptions
      ? tabataBalancedSessionMinutes(tabataBalancedOptions.roundCount)
      : hiitMode || amrapDensityMode || tabataBalancedMode
        ? 4
        : 10;
  if (
    typeof split.session_duration_minutes !== 'number' ||
    split.session_duration_minutes < minSplitDuration
  ) {
    return {
      valid: false,
      error: `split.session_duration_minutes must be at least ${minSplitDuration}`,
    };
  }

  if (amrapDensityMode) {
    const sd = split.session_duration_minutes;
    if (typeof sd !== 'number' || (sd !== 5 && sd !== 15 && sd !== 20)) {
      return {
        valid: false,
        error: 'split.session_duration_minutes must be 5, 15, or 20 for Density-Based AMRAP',
      };
    }
  }

  if (tabataBalancedMode && tabataBalancedOptions) {
    const expected = tabataBalancedSessionMinutes(tabataBalancedOptions.roundCount);
    const sd = split.session_duration_minutes;
    if (typeof sd !== 'number' || sd !== expected) {
      return {
        valid: false,
        error: `split.session_duration_minutes must be ${expected} for Balanced Tabata`,
      };
    }
  }

  if (amrapDensityMode && obj.progression_protocol !== 'density_leverage') {
    return {
      valid: false,
      error: 'progression_protocol must be density_leverage for Density-Based AMRAP',
    };
  }

  if (tabataBalancedMode && obj.progression_protocol !== 'double_progression') {
    return {
      valid: false,
      error: 'progression_protocol must be double_progression for Balanced Tabata',
    };
  }

  const validProtocols: ProgressionProtocol[] = [
    'linear_load',
    'double_progression',
    'density_leverage',
  ];
  if (!validProtocols.includes(obj.progression_protocol as ProgressionProtocol)) {
    return {
      valid: false,
      error: `progression_protocol must be one of: ${validProtocols.join(', ')}`,
    };
  }

  if (typeof obj.progression_rules !== 'object' || obj.progression_rules === null) {
    return { valid: false, error: 'progression_rules object is required' };
  }

  const rules = obj.progression_rules as Record<string, unknown>;
  if (typeof rules.description !== 'string') {
    return { valid: false, error: 'progression_rules.description is required' };
  }
  if (typeof rules.weeks_1_3 !== 'string') {
    return { valid: false, error: 'progression_rules.weeks_1_3 is required' };
  }
  if (typeof rules.weeks_4_6 !== 'string') {
    return { valid: false, error: 'progression_rules.weeks_4_6 is required' };
  }

  if (!Array.isArray(obj.volume_landmarks)) {
    return { valid: false, error: 'volume_landmarks must be an array' };
  }

  if (amrapDensityMode && obj.volume_landmarks.length === 0) {
    return {
      valid: false,
      error: 'volume_landmarks must be non-empty for Density-Based AMRAP',
    };
  }

  if (tabataBalancedMode && obj.volume_landmarks.length === 0) {
    return {
      valid: false,
      error: 'volume_landmarks must be non-empty for Balanced Tabata',
    };
  }

  for (const landmark of obj.volume_landmarks) {
    if (typeof landmark !== 'object' || landmark === null) {
      return { valid: false, error: 'Each volume_landmark must be an object' };
    }
    const lm = landmark as Record<string, unknown>;
    if (typeof lm.muscle_group !== 'string') {
      return { valid: false, error: 'volume_landmark.muscle_group is required' };
    }
    if (typeof lm.mev_sets !== 'number') {
      return { valid: false, error: 'volume_landmark.mev_sets must be a number' };
    }
    if (typeof lm.mrv_sets !== 'number') {
      return { valid: false, error: 'volume_landmark.mrv_sets must be a number' };
    }
  }

  return { valid: true, data: obj as unknown as WorkoutArchitectBlueprint };
}
