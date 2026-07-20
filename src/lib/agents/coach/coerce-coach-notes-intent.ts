/**
 * When the user asks for exercise **coach notes**, force a real
 * `structural_patch.coach_notes` write with address-map ids — never trust model
 * placeholder block ids, and never leave an empty/no-op structural patch that
 * passes self-attestation.
 *
 * Mirror: `supabase/functions/agents/coach/coerce-coach-notes-intent.ts`.
 */

import { messageRequestsCoachNotes } from './exercise-cue-request';
import type { CoachGeminiJsonResponse } from './parse';
import type { CoachStructuralPatchOp } from '../_shared/workout-metadata/structural-patch-types';
import type { WorkoutCuesPatchV1 } from './workout-cues-patch';

type AddressExercise = { exercise_id: string; name: string };
type AddressBlock = { block_id: string; block_name: string; exercises: AddressExercise[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCoachNotesFromStructural(
  patch: CoachStructuralPatchOp[] | null | undefined,
): string | null {
  if (!patch?.length) return null;
  for (const op of patch) {
    if (typeof op.coach_notes === 'string' && op.coach_notes.trim()) {
      return op.coach_notes.trim();
    }
  }
  return null;
}

/** Prefer form_cues, then instructions, tips, injury notes — join if multiple. */
function extractProseFromWorkoutCues(patch: WorkoutCuesPatchV1 | null | undefined): string | null {
  if (!patch) return null;
  const parts: string[] = [];
  for (const key of ['form_cues', 'instructions', 'tips', 'injury_prevention_tips'] as const) {
    const val = patch[key];
    if (typeof val === 'string' && val.trim()) parts.push(val.trim());
  }
  if (parts.length === 0) return null;
  return parts.join(' ').slice(0, 240);
}

/**
 * Pull instructional note content the user already stated in the ask
 * (e.g. "notes on how to … avoid the band rolling…",
 * "regarding how to avoid the band rolling…").
 */
export function extractCoachNotesHintFromUserMessage(
  content: string | null | undefined,
): string | null {
  if (typeof content !== 'string' || !content.trim()) return null;
  const trimmed = content.trim();
  // Prefer explicit instructional phrasing — avoid capturing "notes for [Exercise Name]".
  const m =
    trimmed.match(/\b(?:just\s+)?notes?\s+on\s+how\s+to\s+(.+)$/i) ??
    trimmed.match(/\bregarding\s+how\s+to\s+(.+)$/i) ??
    trimmed.match(/\bhow\s+to\s+(avoid\b.+)$/i);
  const body = m?.[1]?.trim();
  if (!body || body.length < 12) return null;
  const cleaned = body
    .replace(/^(?:do\s+)?them\s+to\s+/i, '')
    .replace(/^avoid\s+/i, 'Avoid ')
    .replace(/[.\s]+$/g, '')
    .trim();
  if (cleaned.length < 12) return null;
  const capped = cleaned.slice(0, 240);
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

type HistoryRowLike = {
  id?: string;
  user_id: string;
  content: string | null;
};

/**
 * True when the user is pointing at a prior Coach explanation ("add this/that to the
 * Coach Note") rather than pasting the note text inline.
 */
export function isReferentialCoachNotesAsk(content: string | null | undefined): boolean {
  if (typeof content !== 'string' || !content.trim()) return false;
  if (!messageRequestsCoachNotes(content)) return false;
  return (
    /\b(add|put|save|write|copy)\b[\s\S]{0,60}\b(this|that|your|the)\b[\s\S]{0,60}\bcoach[_\s-]*not(?:e|es)?\b/i.test(
      content,
    ) ||
    (/\bcoach[_\s-]*not(?:e|es)?\b/i.test(content) &&
      /\b(this|that)\s+(explanation|info|answer|reply|description)\b/i.test(content)) ||
    /\badd\s+your\s+info\b/i.test(content)
  );
}

/**
 * Latest prior agent reply suitable as coach-notes body (skip safe-reply / tiny stubs).
 * Returns up to 240 chars for the note body.
 */
export function findLatestPriorAgentReplyForCoachNotes(
  history: ReadonlyArray<HistoryRowLike>,
  agentAuthUserId: string,
  excludeMessageId?: string | null,
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i]!;
    if (excludeMessageId && row.id === excludeMessageId) continue;
    if (row.user_id !== agentAuthUserId) continue;
    const c = typeof row.content === 'string' ? row.content.trim() : '';
    if (c.length < 24) continue;
    // Skip known attestation fallbacks (cues- or notes-oriented).
    if (/didn['']t actually save/i.test(c)) continue;
    if (/couldn['']t save that to the coach notes/i.test(c)) continue;
    // Skip confirmation stubs — note body is the prior explanation turn.
    if (/^i have added\b/i.test(c)) continue;
    return c.slice(0, 240);
  }
  return null;
}

/** `#Band Pull-Aparts` / `#Foam Roller Thoracic Extension` phrases from chat text. */
export function extractHashtagExercisePhrases(text: string): string[] {
  if (!text.trim()) return [];
  const out: string[] = [];
  const re = /#([A-Za-z][A-Za-z0-9'’/\-]*(?:\s+[A-Za-z0-9'’/\-]+)*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1]?.trim();
    if (phrase && phrase.length >= 3) out.push(phrase);
  }
  return out;
}

/**
 * Name-resolution corpus for coach notes: **current turn only**.
 * For "Add this to the Coach Note", use the immediately preceding user ask (with #tag)
 * plus that coach reply — never the whole thread (earlier #tags steal the match).
 */
export function buildCoachNotesNameSearchText(
  triggerContent: string,
  history: ReadonlyArray<HistoryRowLike>,
  agentAuthUserId?: string,
): string {
  const trigger = triggerContent.trim();
  const parts: string[] = [];
  if (trigger) parts.push(trigger);

  // Walk newest → oldest: find latest usable agent reply, then the user message before it.
  let agentIdx = -1;
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i]!;
    const c = typeof row.content === 'string' ? row.content.trim() : '';
    if (c.length < 12) continue;
    if (/didn['']t actually save/i.test(c) || /couldn['']t save that to the coach notes/i.test(c)) {
      continue;
    }
    const isAgent =
      agentAuthUserId != null
        ? row.user_id === agentAuthUserId
        : // Heuristic when agent id unknown: long explanatory replies after a user ask.
          c.length >= 40 && !messageRequestsCoachNotes(c) && !/^where should i feel/i.test(c);
    if (!isAgent) continue;
    // Prefer replies that look like explanations (not "I have added…").
    if (/^i have added\b/i.test(c)) continue;
    agentIdx = i;
    parts.push(c);
    break;
  }
  if (agentIdx > 0) {
    for (let i = agentIdx - 1; i >= 0; i--) {
      const row = history[i]!;
      if (agentAuthUserId != null && row.user_id === agentAuthUserId) continue;
      const c = typeof row.content === 'string' ? row.content.trim() : '';
      if (!c) continue;
      parts.push(c);
      break;
    }
  } else {
    // No prior agent reply: use the latest prior user message only.
    for (let i = history.length - 1; i >= 0; i--) {
      const row = history[i]!;
      if (agentAuthUserId != null && row.user_id === agentAuthUserId) continue;
      const c = typeof row.content === 'string' ? row.content.trim() : '';
      if (!c || c === trigger) continue;
      parts.push(c);
      break;
    }
  }

  return parts.filter(Boolean).join('\n');
}

function matchHitByNormalizedName(
  hits: MetadataExerciseHit[],
  phrase: string,
): MetadataExerciseHit | null {
  const want = normalizeName(phrase);
  if (!want || want.length < 3) return null;
  // Exact normalized match first.
  const exact = hits.find((h) => normalizeName(h.name) === want);
  if (exact) return exact;
  // Phrase contained in name or name contained in phrase (hashtag may omit hyphenation).
  let best: MetadataExerciseHit | null = null;
  let bestScore = 0;
  for (const h of hits) {
    const nameNorm = normalizeName(h.name);
    if (!nameNorm || nameNorm.length < 3) continue;
    if (nameNorm === want || nameNorm.includes(want) || want.includes(nameNorm)) {
      const score = Math.min(nameNorm.length, want.length);
      if (score > bestScore) {
        best = h;
        bestScore = score;
      }
      continue;
    }
    const words = want.split(' ').filter((w) => w.length >= 3);
    if (words.length > 0 && words.every((w) => nameNorm.includes(w))) {
      const score = want.length;
      if (score > bestScore) {
        best = h;
        bestScore = score;
      }
    }
  }
  return best;
}

/**
 * Resolve exercise by #hashtag (last tag wins), else by name mention preferring
 * the **latest** occurrence in search text (not longest name — that mis-fired when
 * Foam Roller + Band Pull-Aparts both appeared in history).
 */
export function resolveExerciseHitFromSearchText(
  hits: MetadataExerciseHit[],
  searchText: string,
): MetadataExerciseHit | null {
  if (hits.length === 0 || !searchText.trim()) return null;

  const tags = extractHashtagExercisePhrases(searchText);
  for (let i = tags.length - 1; i >= 0; i--) {
    const hit = matchHitByNormalizedName(hits, tags[i]!);
    if (hit) return hit;
  }

  const msgNorm = normalizeName(searchText);
  let best: { hit: MetadataExerciseHit; score: number; lastIdx: number } | null = null;
  for (const h of hits) {
    const nameNorm = normalizeName(h.name);
    if (!nameNorm || nameNorm.length < 4) continue;
    const words = nameNorm.split(' ').filter((w) => w.length >= 3);
    const allWords = words.length > 0 && words.every((w) => msgNorm.includes(w));
    if (!msgNorm.includes(nameNorm) && !allWords) continue;
    const lastIdx = msgNorm.lastIndexOf(nameNorm);
    // Prefer later mention; break ties with longer name only among same lastIdx.
    const score = nameNorm.length;
    if (!best || lastIdx > best.lastIdx || (lastIdx === best.lastIdx && score > best.score)) {
      best = { hit: h, score, lastIdx };
    }
  }
  return best?.hit ?? null;
}

function parseStructuralAddressMap(contextJson: string | null): AddressBlock[] {
  if (!contextJson?.trim()) return [];
  try {
    const parsed = JSON.parse(contextJson) as unknown;
    if (!isPlainObject(parsed)) return [];
    const map = parsed.structural_address_map;
    if (!Array.isArray(map)) return [];
    const out: AddressBlock[] = [];
    for (const raw of map) {
      if (!isPlainObject(raw)) continue;
      const block_id = typeof raw.block_id === 'string' ? raw.block_id.trim() : '';
      const block_name = typeof raw.block_name === 'string' ? raw.block_name.trim() : '';
      if (!block_id) continue;
      const exercisesRaw = raw.exercises;
      const exercises: AddressExercise[] = [];
      if (Array.isArray(exercisesRaw)) {
        for (const ex of exercisesRaw) {
          if (!isPlainObject(ex)) continue;
          const exercise_id = typeof ex.exercise_id === 'string' ? ex.exercise_id.trim() : '';
          const name = typeof ex.name === 'string' ? ex.name.trim() : '';
          if (!exercise_id) continue;
          exercises.push({ exercise_id, name: name || 'Exercise' });
        }
      }
      out.push({ block_id, block_name: block_name || 'Block', exercises });
    }
    return out;
  } catch {
    return [];
  }
}

function addressHasIds(addressMap: AddressBlock[], blockId: string, exerciseId: string): boolean {
  return addressMap.some(
    (b) => b.block_id === blockId && b.exercises.some((ex) => ex.exercise_id === exerciseId),
  );
}

function findByExerciseId(
  addressMap: AddressBlock[],
  exerciseId: string,
): { block_id: string; exercise_id: string } | null {
  const want = exerciseId.trim();
  if (!want) return null;
  for (const block of addressMap) {
    for (const ex of block.exercises) {
      if (ex.exercise_id === want) {
        return { block_id: block.block_id, exercise_id: ex.exercise_id };
      }
    }
  }
  return null;
}

function findByNameInText(
  addressMap: AddressBlock[],
  text: string,
): { block_id: string; exercise_id: string } | null {
  const hits: MetadataExerciseHit[] = addressMap.flatMap((b) =>
    b.exercises.map((ex) => ({
      block_id: b.block_id,
      exercise_id: ex.exercise_id,
      name: ex.name,
    })),
  );
  const hit = resolveExerciseHitFromSearchText(hits, text);
  return hit ? { block_id: hit.block_id, exercise_id: hit.exercise_id } : null;
}

/**
 * Resolve a verified address-map target. Never returns model placeholder ids
 * that are not present in the map.
 */
export function resolveCoachNotesAddressTarget(args: {
  addressMap: AddressBlock[];
  structuralPatch: CoachStructuralPatchOp[] | null;
  triggerContent: string;
}): { block_id: string; exercise_id: string } | null {
  const { addressMap, structuralPatch, triggerContent } = args;
  if (addressMap.length === 0) return null;

  // 1) Model exercise_id that exists in the address map (UUID / stamped id).
  if (structuralPatch?.length) {
    for (const op of structuralPatch) {
      const eid = typeof op.exercise_id === 'string' ? op.exercise_id.trim() : '';
      if (!eid) continue;
      const byEx = findByExerciseId(addressMap, eid);
      if (byEx) return byEx;
      const bid = typeof op.block_id === 'string' ? op.block_id.trim() : '';
      if (bid && addressHasIds(addressMap, bid, eid)) {
        return { block_id: bid, exercise_id: eid };
      }
    }
  }

  // 2) Exercise name mentioned in the user message.
  const byMsg = findByNameInText(addressMap, triggerContent);
  if (byMsg) return byMsg;

  // 3) Single exercise in the whole workout.
  const singles = addressMap.flatMap((b) =>
    b.exercises.map((ex) => ({ block_id: b.block_id, exercise_id: ex.exercise_id })),
  );
  if (singles.length === 1) return singles[0]!;
  return null;
}

type MetadataExerciseHit = {
  block_id: string;
  exercise_id: string;
  name: string;
};

function exerciseDisplayName(ex: Record<string, unknown>): string {
  if (typeof ex.exerciseName === 'string' && ex.exerciseName.trim()) return ex.exerciseName.trim();
  if (typeof ex.name === 'string' && ex.name.trim()) return ex.name.trim();
  return '';
}

function collectExercisesFromSession(session: Record<string, unknown>): MetadataExerciseHit[] {
  const out: MetadataExerciseHit[] = [];
  const run = (key: string, section: 'main' | 'warmup' | 'finisher' | 'cooldown') => {
    const blocks = session[key];
    if (!Array.isArray(blocks)) return;
    for (let i = 0; i < blocks.length; i++) {
      const raw = blocks[i];
      if (!isPlainObject(raw)) continue;
      const order =
        typeof raw.order === 'number' && Number.isFinite(raw.order) && raw.order > 0
          ? Math.round(raw.order)
          : i + 1;
      const block_id =
        typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : section === 'main'
            ? `main-${order}-${i}`
            : `${section}-${order}-${i}`;
      const exercises = raw.exercises;
      if (!Array.isArray(exercises)) continue;
      for (let j = 0; j < exercises.length; j++) {
        const ex = exercises[j];
        if (!isPlainObject(ex)) continue;
        const exercise_id =
          typeof ex.id === 'string' && ex.id.trim() ? ex.id.trim() : `${block_id}:e${j}`;
        const name = exerciseDisplayName(ex);
        out.push({ block_id, exercise_id, name: name || 'Exercise' });
      }
    }
  };
  run('exerciseBlocks', 'main');
  run('warmupBlocks', 'warmup');
  run('finisherBlocks', 'finisher');
  run('cooldownBlocks', 'cooldown');
  return out;
}

/** Walk rich task metadata workout_set and list (block_id, exercise_id, name) rows. */
export function collectCoachNotesTargetsFromMetadata(mergeBase: unknown): MetadataExerciseHit[] {
  if (!isPlainObject(mergeBase)) return [];
  const af = mergeBase.ai_workout_factory;
  if (!isPlainObject(af)) return [];
  const ws = af.workout_set;
  if (!isPlainObject(ws)) return [];
  const workouts = ws.workouts;
  if (Array.isArray(workouts) && workouts.length > 0 && isPlainObject(workouts[0])) {
    return collectExercisesFromSession(workouts[0]);
  }
  return collectExercisesFromSession(ws);
}

/**
 * Resolve coach-notes target against the **DB merge base** (not only address map).
 * Prefer exact exercise id on DB, then #hashtag / name in search text, then single-ex.
 */
export function resolveCoachNotesTargetFromMetadata(args: {
  mergeBase: unknown;
  triggerContent: string;
  modelExerciseId?: string | null;
}): { block_id: string; exercise_id: string } | null {
  const hits = collectCoachNotesTargetsFromMetadata(args.mergeBase);
  if (hits.length === 0) return null;

  const modelId = typeof args.modelExerciseId === 'string' ? args.modelExerciseId.trim() : '';
  if (modelId) {
    const byId = hits.find((h) => h.exercise_id === modelId);
    if (byId) return { block_id: byId.block_id, exercise_id: byId.exercise_id };
  }

  const byName = resolveExerciseHitFromSearchText(hits, args.triggerContent);
  if (byName) return { block_id: byName.block_id, exercise_id: byName.exercise_id };

  if (hits.length === 1) {
    return { block_id: hits[0]!.block_id, exercise_id: hits[0]!.exercise_id };
  }
  return null;
}

/** Extract note text for a coach-notes ask (structural → cues → user hint → prior reply). */
export function extractCoachNotesTextForIntent(args: {
  structuralPatch: CoachStructuralPatchOp[] | null;
  workoutCuesPatch: WorkoutCuesPatchV1 | null;
  triggerContent: string;
  /** Prior Coach explanation when the user says "add this to the Coach Note". */
  priorAgentReply?: string | null;
}): string | null {
  return (
    extractCoachNotesFromStructural(args.structuralPatch) ??
    extractProseFromWorkoutCues(args.workoutCuesPatch) ??
    extractCoachNotesHintFromUserMessage(args.triggerContent) ??
    (typeof args.priorAgentReply === 'string' && args.priorAgentReply.trim().length >= 24
      ? args.priorAgentReply.trim().slice(0, 240)
      : null)
  );
}

/**
 * At persist time: rebuild a single coach_notes op against the real merge-base ids.
 * Returns null when notes text or DB target cannot be resolved (caller must fail closed).
 * Caller is responsible for deciding coach-notes intent before invoking.
 */
export function finalizeCoachNotesStructuralPatch(args: {
  mergeBase: unknown;
  triggerContent: string;
  structuralPatch: CoachStructuralPatchOp[] | null;
  workoutCuesPatch?: WorkoutCuesPatchV1 | null;
  priorAgentReply?: string | null;
  /** Broader text (trigger + recent history) for exercise name matching. */
  nameSearchText?: string | null;
}): CoachStructuralPatchOp[] | null {
  const coachNotes = extractCoachNotesTextForIntent({
    structuralPatch: args.structuralPatch,
    workoutCuesPatch: args.workoutCuesPatch ?? null,
    triggerContent: args.triggerContent,
    priorAgentReply: args.priorAgentReply,
  });
  if (!coachNotes) return null;

  const modelExerciseId =
    args.structuralPatch?.find((op) => typeof op.exercise_id === 'string' && op.exercise_id.trim())
      ?.exercise_id ?? null;

  const target = resolveCoachNotesTargetFromMetadata({
    mergeBase: args.mergeBase,
    triggerContent: args.nameSearchText?.trim() || args.triggerContent,
    modelExerciseId,
  });
  if (!target) return null;

  return [
    {
      block_id: target.block_id,
      exercise_id: target.exercise_id,
      coach_notes: coachNotes.slice(0, 240),
    },
  ];
}

/**
 * Remap coach-notes user intent onto `structural_patch.coach_notes` with verified ids.
 * Clears `workout_cues_patch`. If notes text or target cannot be resolved, clears
 * `structural_patch` so self-attestation fails closed instead of a fake success.
 */
export function coerceCoachNotesIntent(args: {
  parsed: CoachGeminiJsonResponse;
  triggerContent: string | null | undefined;
  currentWorkoutContextJson: string | null;
  priorAgentReply?: string | null;
  nameSearchText?: string | null;
  /** DB / task metadata merge base — used when address map misses the exercise. */
  mergeBase?: unknown;
}): CoachGeminiJsonResponse {
  const { parsed, triggerContent, currentWorkoutContextJson } = args;
  if (!messageRequestsCoachNotes(triggerContent)) return parsed;

  const trigger = typeof triggerContent === 'string' ? triggerContent : '';
  const nameSearch = args.nameSearchText?.trim() || trigger;
  const coachNotes = extractCoachNotesTextForIntent({
    structuralPatch: parsed.structural_patch,
    workoutCuesPatch: parsed.workout_cues_patch,
    triggerContent: trigger,
    priorAgentReply: args.priorAgentReply,
  });

  const addressMap = parseStructuralAddressMap(currentWorkoutContextJson);
  const modelExerciseId =
    parsed.structural_patch?.find(
      (op) => typeof op.exercise_id === 'string' && op.exercise_id.trim(),
    )?.exercise_id ?? null;
  let target = resolveCoachNotesAddressTarget({
    addressMap,
    structuralPatch: parsed.structural_patch,
    triggerContent: nameSearch,
  });
  if (!target && args.mergeBase != null) {
    target = resolveCoachNotesTargetFromMetadata({
      mergeBase: args.mergeBase,
      triggerContent: nameSearch,
      modelExerciseId,
    });
  }

  // Always drop cue patch on this intent — cues must not steal the persist path.
  if (!coachNotes || !target) {
    return {
      ...parsed,
      workout_cues_patch: null,
      // Clear no-op / fake structural so "I have added…" cannot pass attestation.
      structural_patch: null,
      update_existing_task: false,
    };
  }

  const notesOp: CoachStructuralPatchOp = {
    block_id: target.block_id,
    exercise_id: target.exercise_id,
    coach_notes: coachNotes.slice(0, 240),
  };

  return {
    ...parsed,
    workout_cues_patch: null,
    update_existing_task: true,
    structural_patch: [notesOp],
  };
}
