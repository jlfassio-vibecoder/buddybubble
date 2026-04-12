/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Step 2: The Biomechanist
 * Maps movement patterns to days for structural balance.
 */

import type { ArchitectBlueprint, PatternSkeleton } from '@/lib/workout-factory/types/ai-program';

/**
 * Build the prompt for Step 2: The Biomechanist
 */
export function buildBiomechanistPrompt(architect: ArchitectBlueprint): string {
  return `Role: You are the Biomechanist.
Task: Map movement patterns to each training day. DO NOT select specific exercises yet.

=== INPUT FROM ARCHITECT ===
Program: ${architect.program_name}
Split Type: ${architect.split.type}
Days Per Week: ${architect.split.days_per_week}
Session Duration: ${architect.split.session_duration_minutes} minutes

Progression Protocol: ${architect.progression_protocol}
${architect.progression_rules.description}

Volume Landmarks:
${architect.volume_landmarks.map((v) => `- ${v.muscle_group}: ${v.mev_sets}-${v.mrv_sets} sets/week`).join('\n')}

=== YOUR TASK ===
For each training day in the ${architect.split.type} split, assign movement patterns to ensure STRUCTURAL BALANCE.

Movement Pattern Categories:
- UPPER: Horizontal Push, Horizontal Pull, Vertical Push, Vertical Pull
- LOWER: Knee Dominant (Squat), Hip Dominant (Hinge)
- ACCESSORIES: Arms (Biceps, Triceps), Core, Calves, Rear Delts

Rules:
1. Match push volume with pull volume (horizontal and vertical)
2. Match quad volume with hamstring/glute volume
3. Compounds come before isolations
4. Primary movements get most volume; secondary get less

=== OUTPUT FORMAT ===
Return ONLY valid JSON. No markdown, no explanations.
Each pattern must have "priority" set to exactly "primary" or "secondary" (no other values like tertiary).

{
  "days": [
    {
      "day_number": 1,
      "day_name": "Upper Strength",
      "patterns": [
        { "pattern": "Horizontal Push", "category": "compound", "priority": "primary" },
        { "pattern": "Horizontal Pull", "category": "compound", "priority": "primary" },
        { "pattern": "Vertical Push", "category": "compound", "priority": "secondary" },
        { "pattern": "Vertical Pull", "category": "compound", "priority": "secondary" },
        { "pattern": "Triceps", "category": "accessory", "priority": "secondary" },
        { "pattern": "Biceps", "category": "accessory", "priority": "secondary" }
      ]
    },
    {
      "day_number": 2,
      "day_name": "Lower Strength",
      "patterns": [
        { "pattern": "Knee Dominant", "category": "compound", "priority": "primary" },
        { "pattern": "Hip Dominant", "category": "compound", "priority": "primary" },
        { "pattern": "Knee Flexion", "category": "isolation", "priority": "secondary" },
        { "pattern": "Calves", "category": "accessory", "priority": "secondary" }
      ]
    }
  ]
}

Generate exactly ${architect.split.days_per_week} training days.`;
}

/**
 * Validate Step 2 output
 */
export function validateBiomechanistOutput(
  data: unknown,
  expectedDays: number,
): { valid: true; data: PatternSkeleton } | { valid: false; error: string } {
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Biomechanist output must be an object' };
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.days)) {
    return { valid: false, error: 'days must be an array' };
  }

  if (obj.days.length !== expectedDays) {
    return {
      valid: false,
      error: `Expected ${expectedDays} days, got ${obj.days.length}`,
    };
  }

  for (let i = 0; i < obj.days.length; i++) {
    const day = obj.days[i] as Record<string, unknown>;

    if (typeof day !== 'object' || day === null) {
      return { valid: false, error: `Day ${i + 1} must be an object` };
    }

    if (typeof day.day_number !== 'number') {
      return { valid: false, error: `Day ${i + 1}: day_number must be a number` };
    }

    if (typeof day.day_name !== 'string' || !day.day_name.trim()) {
      return { valid: false, error: `Day ${i + 1}: day_name is required` };
    }

    if (!Array.isArray(day.patterns) || day.patterns.length === 0) {
      return { valid: false, error: `Day ${i + 1}: patterns must be a non-empty array` };
    }

    for (let j = 0; j < day.patterns.length; j++) {
      const pattern = day.patterns[j] as Record<string, unknown>;

      if (typeof pattern !== 'object' || pattern === null) {
        return { valid: false, error: `Day ${i + 1}, Pattern ${j + 1}: must be an object` };
      }

      if (typeof pattern.pattern !== 'string' || !pattern.pattern.trim()) {
        return { valid: false, error: `Day ${i + 1}, Pattern ${j + 1}: pattern name is required` };
      }

      const validCategories = ['compound', 'isolation', 'accessory'];
      if (!validCategories.includes(pattern.category as string)) {
        return {
          valid: false,
          error: `Day ${i + 1}, Pattern ${j + 1}: category must be compound, isolation, or accessory`,
        };
      }

      const validPriorities = ['primary', 'secondary'];
      const priority = pattern.priority as string;
      if (!validPriorities.includes(priority)) {
        return {
          valid: false,
          error: `Day ${i + 1}, Pattern ${j + 1}: priority must be primary or secondary`,
        };
      }
    }
  }

  return { valid: true, data: obj as unknown as PatternSkeleton };
}
