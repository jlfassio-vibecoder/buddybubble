/**
 * Pure merge: Coach `proposed_workout_metadata` → next `tasks.metadata` snapshot.
 * Canonical for Vitest; Deno mirror at `supabase/functions/_shared/workout-metadata/`.
 * Parity: `pnpm check:agent-mirror` (canonical must live under `src/lib/agents/_shared/`
 * so the parity script discovers the pair).
 */

export type MergeInput = {
  /** Current `tasks.metadata`. Treated as object; non-object → {}. */
  base: unknown;
  /** Post-parse, post-guard Coach `proposed_workout_metadata`. */
  proposed: Record<string, unknown> | null;
};

export type MergeLogDrop = { field: string; reason: string };

export type MergeLog = {
  target: 'rich' | 'flat';
  touched: Array<'warmup' | 'exerciseBlocks' | 'finisher' | 'cooldown'>;
  exerciseCount: number;
  drops: MergeLogDrop[];
  /** Phase 11.2: per-block formats actually written to exerciseBlocks. */
  blockFormats: string[];
};

export type MergeResult = {
  /** Next `tasks.metadata` to persist. */
  metadata: Record<string, unknown>;
  mergeLog: MergeLog;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/** Regex table — exported for Vitest. */
export function classifyBlockRole(name: string): 'warmup' | 'finisher' | 'cooldown' | 'main' {
  const n = name.trim();
  if (/warm[\s-]?up/i.test(n)) return 'warmup';
  if (/finisher|burnout|amrap finisher/i.test(n)) return 'finisher';
  if (/cool[\s-]?down|mobility|flexibility|stretch/i.test(n)) return 'cooldown';
  return 'main';
}

function isMainBlockName(name: string): boolean {
  const t = name.trim();
  return t.length === 0 || /^main$/i.test(t);
}

function nextInstructionOrder(arr: Array<Record<string, unknown>>): number {
  let max = 0;
  for (const row of arr) {
    const o = typeof row.order === 'number' && Number.isFinite(row.order) ? row.order : 0;
    if (o > max) max = o;
  }
  return max + 1;
}

function positiveMergeInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

/** Propagate Tabata block format_params to each factory exercise row for viewer/player. */
function hydrateTabataExercisesFromFormatParams(
  mappedInner: Record<string, unknown>[],
  normalizedParams: Record<string, unknown>,
): void {
  const rounds = positiveMergeInt(normalizedParams.rounds);
  const work = positiveMergeInt(normalizedParams.work_seconds);
  const rest = positiveMergeInt(normalizedParams.rest_seconds);
  for (const ex of mappedInner) {
    if (rounds != null && typeof ex.rounds !== 'number') ex.rounds = rounds;
    if (work != null && typeof ex.workSeconds !== 'number') ex.workSeconds = work;
    if (rest != null && typeof ex.restSeconds !== 'number') ex.restSeconds = rest;
    delete ex.sets;
    ex.reps = '';
  }
}

function proposedExerciseToFactoryExercise(
  e: Record<string, unknown>,
  order: number,
): Record<string, unknown> | null {
  const name = typeof e.name === 'string' ? e.name.trim() : '';
  if (!name) return null;
  const row: Record<string, unknown> = {
    order,
    exerciseName: name,
  };
  if (typeof e.sets === 'number' && Number.isFinite(e.sets) && e.sets > 0) {
    row.sets = Math.round(e.sets);
  } else {
    row.sets = 1;
  }
  const reps = e.reps;
  row.reps = reps == null ? '' : typeof reps === 'string' ? reps : String(reps);
  if (typeof e.rpe === 'number' && Number.isFinite(e.rpe)) row.rpe = e.rpe;
  if (typeof e.rest_seconds === 'number' && Number.isFinite(e.rest_seconds))
    row.restSeconds = e.rest_seconds;
  if (typeof e.restSeconds === 'number' && Number.isFinite(e.restSeconds))
    row.restSeconds = e.restSeconds;
  if (typeof e.work_seconds === 'number' && Number.isFinite(e.work_seconds))
    row.workSeconds = e.work_seconds;
  if (typeof e.workSeconds === 'number' && Number.isFinite(e.workSeconds))
    row.workSeconds = e.workSeconds;
  if (typeof e.rounds === 'number' && Number.isFinite(e.rounds) && e.rounds > 0)
    row.rounds = Math.round(e.rounds);
  if (typeof e.coach_notes === 'string' && e.coach_notes.trim())
    row.coachNotes = e.coach_notes.trim();
  if (typeof e.coachNotes === 'string' && e.coachNotes.trim()) row.coachNotes = e.coachNotes.trim();
  if (typeof e.equipment === 'string' && e.equipment.trim()) row.equipment = e.equipment.trim();
  return row;
}

function factoryExerciseToWorkoutExercise(fe: Record<string, unknown>): Record<string, unknown> {
  const name =
    typeof fe.exerciseName === 'string'
      ? fe.exerciseName.trim()
      : typeof fe.name === 'string'
        ? fe.name.trim()
        : '';
  const out: Record<string, unknown> = { name };
  if (typeof fe.sets === 'number' && Number.isFinite(fe.sets) && fe.sets > 0) out.sets = fe.sets;
  const reps = fe.reps;
  if (reps != null) {
    if (typeof reps === 'number' && Number.isFinite(reps)) out.reps = reps;
    else if (typeof reps === 'string') {
      if (/^\d+$/.test(reps.trim())) out.reps = parseInt(reps.trim(), 10);
      else out.reps = reps;
    }
  }
  if (typeof fe.rpe === 'number' && Number.isFinite(fe.rpe)) out.rpe = fe.rpe;
  if (typeof fe.restSeconds === 'number' && Number.isFinite(fe.restSeconds))
    out.rest_seconds = fe.restSeconds;
  if (typeof fe.workSeconds === 'number' && Number.isFinite(fe.workSeconds))
    out.work_seconds = fe.workSeconds;
  if (typeof fe.rounds === 'number' && Number.isFinite(fe.rounds) && fe.rounds > 0)
    out.rounds = fe.rounds;
  const cn = fe.coachNotes ?? fe.coach_notes;
  if (typeof cn === 'string' && cn.trim()) out.coach_notes = cn.trim();
  if (typeof fe.equipment === 'string' && fe.equipment.trim()) out.equipment = fe.equipment.trim();
  return out;
}

/** Flatten session strength exercises (exerciseBlocks, else legacy `blocks`) → editor rows. */
export function flattenSessionExercisesForMetadata(
  session: Record<string, unknown>,
): Record<string, unknown>[] {
  const eb = session.exerciseBlocks;
  if (Array.isArray(eb) && eb.length > 0) {
    const out: Record<string, unknown>[] = [];
    for (const block of eb) {
      if (!isPlainObject(block)) continue;
      const exercises = block.exercises;
      if (!Array.isArray(exercises)) continue;
      let ord = 0;
      for (const ex of exercises) {
        if (!isPlainObject(ex)) continue;
        ord += 1;
        const fe = { ...ex, order: typeof ex.order === 'number' ? ex.order : ord };
        out.push(factoryExerciseToWorkoutExercise(fe));
      }
    }
    return out;
  }
  const legacy = session.blocks;
  if (Array.isArray(legacy)) {
    return legacy
      .map((ex, i) =>
        isPlainObject(ex) ? factoryExerciseToWorkoutExercise({ ...ex, order: i + 1 }) : null,
      )
      .filter((x): x is Record<string, unknown> => x != null);
  }
  return [];
}

function mapCoachExercisesToFactory(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  const out: Record<string, unknown>[] = [];
  let ord = 0;
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    ord += 1;
    const fe = proposedExerciseToFactoryExercise(item, ord);
    if (fe) out.push(fe);
  }
  return out;
}

function exerciseBlocksDeepEqual(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  if (!a || !b) return false;
  const na = typeof a.name === 'string' ? a.name.trim() : '';
  const nb = typeof b.name === 'string' ? b.name.trim() : '';
  if (na !== nb) return false;
  return stableStringify(a.exercises) === stableStringify(b.exercises);
}

function instructionBlockExists(
  arr: Array<Record<string, unknown>>,
  candidate: Record<string, unknown>,
): boolean {
  const sig = stableStringify({
    exerciseName: candidate.exerciseName,
    instructions: candidate.instructions,
  });
  return arr.some(
    (row) =>
      stableStringify({
        exerciseName: row.exerciseName,
        instructions: row.instructions,
      }) === sig,
  );
}

function blockIsParametric(block: Record<string, unknown>): boolean {
  const f = block.block_format;
  return typeof f === 'string' && f.length > 0;
}

function parseInstructionsField(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const lines = raw
      .map((x) => (typeof x === 'string' ? x.trim() : x != null ? String(x) : ''))
      .filter((s) => s.length > 0);
    return lines.length > 0 ? lines : null;
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return null;
}

function mergeProposedScalars(
  next: Record<string, unknown>,
  proposed: Record<string, unknown>,
  log: MergeLog,
): void {
  if (typeof proposed.workout_type === 'string' && proposed.workout_type.trim()) {
    next.workout_type = proposed.workout_type.trim();
  }
  if (
    typeof proposed.duration_min === 'number' &&
    Number.isFinite(proposed.duration_min) &&
    proposed.duration_min > 0
  ) {
    next.duration_min = Math.round(proposed.duration_min);
    const af = next.ai_workout_factory;
    if (isPlainObject(af)) {
      const wset = af.workout_set;
      if (isPlainObject(wset) && Array.isArray(wset.workouts) && wset.workouts.length > 0) {
        const s0 = wset.workouts[0];
        if (isPlainObject(s0)) {
          s0.duration_min = Math.round(proposed.duration_min);
        }
      }
    }
  } else if (proposed.duration_min != null) {
    log.drops.push({ field: 'duration_min', reason: 'invalid_or_non_positive' });
  }
}

function ensureExerciseBlocks(session: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(session.exerciseBlocks)) session.exerciseBlocks = [];
  return session.exerciseBlocks as Array<Record<string, unknown>>;
}

function findOrCreateMainBlock(session: Record<string, unknown>): Record<string, unknown> {
  const blocks = ensureExerciseBlocks(session);
  for (const b of blocks) {
    if (!isPlainObject(b)) continue;
    const n = typeof b.name === 'string' ? b.name : '';
    if (isMainBlockName(n)) return b;
  }
  const main: Record<string, unknown> = { name: 'Main', exercises: [] };
  blocks.push(main);
  return main;
}

function appendExercisesToBlock(
  block: Record<string, unknown>,
  newExercises: Record<string, unknown>[],
  log: MergeLog,
  idempotencyKey: string,
): void {
  if (!Array.isArray(block.exercises)) block.exercises = [];
  const existing = block.exercises as Array<Record<string, unknown>>;
  const tailJson = stableStringify(newExercises);
  const curTail = existing.slice(-newExercises.length);
  if (newExercises.length > 0 && stableStringify(curTail) === tailJson) {
    log.drops.push({ field: idempotencyKey, reason: 'already_present_tail' });
    return;
  }
  existing.push(...newExercises);
}

function mergeRichBlocks(
  session: Record<string, unknown>,
  blocksRaw: unknown,
  log: MergeLog,
): void {
  if (!Array.isArray(blocksRaw)) return;
  const exerciseBlocks = ensureExerciseBlocks(session);

  for (const bRaw of blocksRaw) {
    if (!isPlainObject(bRaw)) continue;
    const blockName = typeof bRaw.name === 'string' ? bRaw.name.trim() : '';
    if (!blockName) {
      log.drops.push({ field: 'blocks[]', reason: 'missing_block_name' });
      continue;
    }
    const role = classifyBlockRole(blockName);
    const innerEx = bRaw.exercises;
    const innerList = Array.isArray(innerEx) ? innerEx : [];
    const mappedInner = mapCoachExercisesToFactory(innerList);
    const instructions = parseInstructionsField(bRaw.instructions);

    if (mappedInner.length === 0 && instructions && instructions.length > 0) {
      if (role === 'main') {
        log.drops.push({
          field: `blocks:${blockName}`,
          reason: 'instruction_only_requires_warmup_finisher_or_cooldown_role',
        });
        continue;
      }
      const row: Record<string, unknown> = {
        order: 0,
        exerciseName: blockName,
        instructions,
      };
      const targetKey =
        role === 'warmup'
          ? 'warmupBlocks'
          : role === 'finisher'
            ? 'finisherBlocks'
            : 'cooldownBlocks';
      if (!Array.isArray(session[targetKey])) session[targetKey] = [];
      const arr = session[targetKey] as Array<Record<string, unknown>>;
      row.order = nextInstructionOrder(arr);
      if (instructionBlockExists(arr, row)) {
        log.drops.push({
          field: `blocks:${blockName}`,
          reason: 'instruction_block_already_present',
        });
        continue;
      }
      arr.push(row);
      if (targetKey === 'warmupBlocks') log.touched.push('warmup');
      else if (targetKey === 'finisherBlocks') log.touched.push('finisher');
      else log.touched.push('cooldown');
      continue;
    }

    const newBlock: Record<string, unknown> = {
      name: blockName,
      exercises: mappedInner,
    };
    const rawFormat = typeof bRaw.block_format === 'string' ? bRaw.block_format.trim() : '';
    let normalizedParams: Record<string, unknown> | null = null;
    if (rawFormat) {
      newBlock.blockFormat = rawFormat;
      log.blockFormats.push(rawFormat);
      if (
        bRaw.format_params &&
        typeof bRaw.format_params === 'object' &&
        !Array.isArray(bRaw.format_params)
      ) {
        normalizedParams = JSON.parse(JSON.stringify(bRaw.format_params)) as Record<
          string,
          unknown
        >;
        newBlock.formatParams = normalizedParams;
      }
    }
    if (rawFormat === 'emom' && normalizedParams) {
      const interval =
        typeof normalizedParams.interval_seconds === 'number'
          ? normalizedParams.interval_seconds
          : null;
      const restInInterval =
        typeof normalizedParams.rest_in_interval_seconds === 'number'
          ? normalizedParams.rest_in_interval_seconds
          : 0;
      if (interval && interval > 0) {
        const derivedWork = Math.max(0, interval - Math.max(0, restInInterval));
        const derivedRest = Math.max(0, restInInterval);
        for (const ex of mappedInner) {
          if (typeof ex.workSeconds !== 'number') ex.workSeconds = derivedWork;
          if (typeof ex.restSeconds !== 'number') ex.restSeconds = derivedRest;
        }
      }
    }
    if (rawFormat === 'tabata' && normalizedParams) {
      hydrateTabataExercisesFromFormatParams(mappedInner, normalizedParams);
    }
    const dup = exerciseBlocks.some((eb) => exerciseBlocksDeepEqual(eb, newBlock));
    if (dup) {
      log.drops.push({ field: `blocks:${blockName}`, reason: 'exercise_block_already_present' });
      continue;
    }
    exerciseBlocks.push(newBlock);
    log.touched.push('exerciseBlocks');
  }
}

function mergeRichFlatExercises(
  session: Record<string, unknown>,
  exercisesRaw: unknown,
  log: MergeLog,
): void {
  if (!Array.isArray(exercisesRaw) || exercisesRaw.length === 0) return;
  const main = findOrCreateMainBlock(session);
  const mapped = mapCoachExercisesToFactory(exercisesRaw);
  appendExercisesToBlock(main, mapped, log, 'exercises');
  if (mapped.length > 0) log.touched.push('exerciseBlocks');
}

function mergeIntoFlat(
  next: Record<string, unknown>,
  proposedIn: Record<string, unknown>,
  log: MergeLog,
): void {
  let proposed = proposedIn;
  if (Array.isArray(proposed.blocks) && proposed.blocks.length > 0) {
    const filtered: unknown[] = [];
    for (let i = 0; i < proposed.blocks.length; i++) {
      const b = proposed.blocks[i];
      if (isPlainObject(b) && blockIsParametric(b)) {
        log.drops.push({ field: `blocks[${i}]`, reason: 'parametric_requires_rich_workout_set' });
        continue;
      }
      filtered.push(b);
    }
    proposed = { ...proposed, blocks: filtered };
  }
  mergeProposedScalars(next, proposed, log);

  const blocksRaw = proposed.blocks;
  const exercisesRaw = proposed.exercises;

  if (Array.isArray(blocksRaw) && blocksRaw.length > 0) {
    type Bucket = 'warmup' | 'main' | 'finisher' | 'cooldown';
    const buckets: Record<Bucket, Array<Record<string, unknown>>> = {
      warmup: [],
      main: [],
      finisher: [],
      cooldown: [],
    };
    for (const bRaw of blocksRaw) {
      if (!isPlainObject(bRaw)) continue;
      const blockName = typeof bRaw.name === 'string' ? bRaw.name.trim() : '';
      if (!blockName) continue;
      const role = classifyBlockRole(blockName);
      const key: Bucket =
        role === 'warmup'
          ? 'warmup'
          : role === 'finisher'
            ? 'finisher'
            : role === 'cooldown'
              ? 'cooldown'
              : 'main';
      buckets[key].push(bRaw);
    }
    const ordered: Array<Record<string, unknown>> = [
      ...buckets.warmup,
      ...buckets.main,
      ...buckets.finisher,
      ...buckets.cooldown,
    ];
    const flat: Record<string, unknown>[] = [];
    for (const blk of ordered) {
      const blockName = typeof blk.name === 'string' ? blk.name.trim() : '';
      const inner = Array.isArray(blk.exercises) ? blk.exercises : [];
      const prefix = isMainBlockName(blockName) ? '' : `${blockName}: `;
      for (const ex of inner) {
        if (!isPlainObject(ex)) continue;
        const we = proposedExerciseToFactoryExercise(ex, flat.length + 1);
        if (!we) continue;
        const row = factoryExerciseToWorkoutExercise(we);
        const nm = typeof row.name === 'string' ? row.name : '';
        if (prefix && nm) row.name = `${prefix}${nm}`;
        flat.push(row);
      }
    }
    if (flat.length > 0) next.exercises = flat;
  } else if (Array.isArray(exercisesRaw) && exercisesRaw.length > 0) {
    const mapped: Record<string, unknown>[] = [];
    let i = 0;
    for (const ex of exercisesRaw) {
      if (!isPlainObject(ex)) continue;
      i += 1;
      const fe = proposedExerciseToFactoryExercise(ex, i);
      if (!fe) continue;
      const we = factoryExerciseToWorkoutExercise(fe);
      if (typeof we.name === 'string' && we.name.length > 0) mapped.push(we);
    }
    if (mapped.length > 0) next.exercises = mapped;
  }
}

function mergeIntoRich(
  next: Record<string, unknown>,
  proposed: Record<string, unknown>,
  log: MergeLog,
): void {
  mergeProposedScalars(next, proposed, log);
  const af = next.ai_workout_factory;
  if (!isPlainObject(af)) return;
  const wset = af.workout_set;
  if (!isPlainObject(wset)) return;
  const workouts = wset.workouts;
  if (!Array.isArray(workouts) || workouts.length === 0) return;
  const session = workouts[0];
  if (!isPlainObject(session)) return;

  const hasBlocks = Array.isArray(proposed.blocks) && proposed.blocks.length > 0;
  if (hasBlocks) mergeRichBlocks(session, proposed.blocks, log);
  const hasExercises = Array.isArray(proposed.exercises) && proposed.exercises.length > 0;
  if (hasExercises && !hasBlocks) mergeRichFlatExercises(session, proposed.exercises, log);

  next.exercises = flattenSessionExercisesForMetadata(session);
}

function isProposedEffectivelyEmpty(proposed: Record<string, unknown>): boolean {
  const hasWT =
    typeof proposed.workout_type === 'string' && proposed.workout_type.trim().length > 0;
  const hasDM =
    typeof proposed.duration_min === 'number' &&
    Number.isFinite(proposed.duration_min) &&
    proposed.duration_min > 0;
  const hasEx = Array.isArray(proposed.exercises) && proposed.exercises.length > 0;
  const hasBl = Array.isArray(proposed.blocks) && proposed.blocks.length > 0;
  return !hasWT && !hasDM && !hasEx && !hasBl;
}

/**
 * Merge Coach `proposed_workout_metadata` into a full next `tasks.metadata` object.
 * Pure function — no I/O.
 */
export function mergeCoachProposedIntoTaskMetadata(input: MergeInput): MergeResult {
  const baseObj: Record<string, unknown> = isPlainObject(input.base) ? input.base : {};
  const proposed = input.proposed;

  const rich = hasRichWorkoutSet(baseObj);
  const emptyInput =
    proposed == null || (isPlainObject(proposed) && Object.keys(proposed).length === 0);

  if (emptyInput || (isPlainObject(proposed) && isProposedEffectivelyEmpty(proposed))) {
    let exerciseCount = 0;
    if (rich && isPlainObject(baseObj.ai_workout_factory)) {
      const wset = (baseObj.ai_workout_factory as { workout_set?: { workouts?: unknown[] } })
        .workout_set;
      if (isPlainObject(wset) && Array.isArray(wset.workouts) && wset.workouts.length > 0) {
        const s0 = wset.workouts[0];
        if (isPlainObject(s0)) exerciseCount = flattenSessionExercisesForMetadata(s0).length;
      }
    } else {
      const ex = baseObj.exercises;
      exerciseCount = Array.isArray(ex) ? ex.length : 0;
    }
    return {
      metadata: deepClone(baseObj),
      mergeLog: {
        target: rich ? 'rich' : 'flat',
        touched: [],
        exerciseCount,
        drops: [],
        blockFormats: [],
      },
    };
  }

  const next = deepClone(baseObj);
  const log: MergeLog = {
    target: rich ? 'rich' : 'flat',
    touched: [],
    exerciseCount: 0,
    drops: [],
    blockFormats: [],
  };

  if (rich) mergeIntoRich(next, proposed!, log);
  else mergeIntoFlat(next, proposed!, log);

  if (rich && isPlainObject(next.ai_workout_factory)) {
    const wset = (next.ai_workout_factory as { workout_set?: { workouts?: unknown[] } })
      .workout_set;
    if (isPlainObject(wset) && Array.isArray(wset.workouts) && wset.workouts.length > 0) {
      const s0 = wset.workouts[0];
      if (isPlainObject(s0)) {
        log.exerciseCount = flattenSessionExercisesForMetadata(s0).length;
      }
    }
  } else {
    const ex = next.exercises;
    log.exerciseCount = Array.isArray(ex) ? ex.length : 0;
  }

  return { metadata: next, mergeLog: log };
}

function hasRichWorkoutSet(base: Record<string, unknown>): boolean {
  const af = base.ai_workout_factory;
  if (!isPlainObject(af)) return false;
  const ws = af.workout_set;
  if (!isPlainObject(ws)) return false;
  const workouts = ws.workouts;
  return Array.isArray(workouts) && workouts.length > 0;
}
