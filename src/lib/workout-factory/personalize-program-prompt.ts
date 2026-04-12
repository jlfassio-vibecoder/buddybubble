import type { ProgramWeek } from '@/lib/item-metadata';
import type { WorkoutPersona } from '@/lib/workout-factory/types/ai-workout';

function uniqueSessionKeys(schedule: ProgramWeek[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const w of schedule) {
    for (const d of w.days ?? []) {
      const k = d.name?.trim() ?? '';
      if (!k || seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  }
  return keys;
}

export function buildPersonalizeProgramUserPrompt(params: {
  baseTitle: string;
  goal: string;
  durationWeeks: number;
  schedule: ProgramWeek[];
  personaJson: string;
  equipmentCsv: string;
}): { userPrompt: string; sessionKeys: string[] } {
  const sessionKeys = uniqueSessionKeys(params.schedule);
  const scheduleJson = JSON.stringify(params.schedule, null, 0);

  const userPrompt = `You are personalizing a training PROGRAM for one athlete (not writing a marketing page).

## Athlete / equipment context (JSON)
${params.personaJson}

## Available equipment (names)
${params.equipmentCsv || 'Bodyweight'}

## Program template (from trainer library)
- Base title: ${params.baseTitle}
- Goal: ${params.goal}
- Duration (weeks): ${params.durationWeeks}
- Schedule JSON (preserve structure; session keys are day "name" values): ${scheduleJson}

## Required output (ONLY valid JSON, no markdown)
You MUST return exactly one JSON object with this shape:
{
  "title_suffix": "Short personalized suffix for the card title (max ~60 chars). No emojis. Will be shown as: BaseTitle - title_suffix",
  "description": "2–5 paragraphs of program-level coaching copy tailored to this athlete: goals, constraints, how the weeks progress, recovery, and what success looks like.",
  "sessions": [
    {
      "key": "EXACT string matching one session key from the list below",
      "title": "Concise workout card title for this session",
      "description": "1–3 sentences: intent, focus, and progression notes for this session only.",
      "exercises": [
        { "name": "Exercise", "sets": 3, "reps": "8-10", "coach_notes": "optional" }
      ]
    }
  ]
}

## Session keys you MUST cover (one object per key, same spelling)
${sessionKeys.length ? sessionKeys.map((k) => `- ${JSON.stringify(k)}`).join('\n') : '(none — return sessions: [])'}

Rules:
- Every "key" in sessions must appear exactly once and match the list above character-for-character.
- exercises: 4–10 movements per session when possible; respect equipment; respect injuries/conditions from persona.
- Use realistic sets/reps strings; keep coach_notes short.
`;

  return { userPrompt, sessionKeys };
}

export type PersonalizeProgramPromptParams = {
  persona: WorkoutPersona;
  equipmentNames: string[];
  baseTitle: string;
  goal: string;
  durationWeeks: number;
  schedule: ProgramWeek[];
};

export function buildPersonalizeProgramPromptBundle(params: PersonalizeProgramPromptParams): {
  userPrompt: string;
  sessionKeys: string[];
} {
  const personaJson = JSON.stringify(
    {
      demographics: params.persona.demographics,
      goals: params.persona.goals,
      medical: params.persona.medical,
      lifestyle: params.persona.lifestyle,
      split_type: params.persona.splitType,
      sessions_per_week: params.persona.sessionsPerWeek,
      session_duration_minutes: params.persona.sessionDurationMinutes,
    },
    null,
    2,
  );
  return buildPersonalizeProgramUserPrompt({
    baseTitle: params.baseTitle,
    goal: params.goal,
    durationWeeks: params.durationWeeks,
    schedule: params.schedule,
    personaJson,
    equipmentCsv: params.equipmentNames.join(', '),
  });
}
