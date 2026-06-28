/**
 * Session telemetry prompt formatting — pure module (Vitest canonical).
 *
 * Mirror: `supabase/functions/agents/coach/session-telemetry-format.ts`
 * Run `pnpm check:agent-mirror` after edits.
 *
 * Does not import the client builder (`session-telemetry.ts`).
 */

/** Keep in sync with `MESSAGE_METADATA_SESSION_TELEMETRY_KEY` in coach-telemetry-bridge.ts */
export const SESSION_TELEMETRY_METADATA_KEY = 'session_telemetry' as const;

export const SESSION_TELEMETRY_HEADER = '--- SESSION TELEMETRY (live performance) ---';

export const SESSION_TELEMETRY_INTERVAL_HEADER =
  '--- INTERVAL_BLOCK_TIMERS (authoritative for Tabata/EMOM/AMRAP status) ---';

export const SESSION_TELEMETRY_RAIL_MAX_BYTES = 3_072;
export const SESSION_TELEMETRY_FULL_MAX_BYTES = 4_096;

export const ACTIVE_SESSION_SURFACE_VALUE = 'active_session' as const;

export type SessionTelemetrySetDeltaStatus = 'done' | 'partial' | 'skipped' | 'not_started';

export type SessionTelemetrySnapshotV1 = {
  schema_version: 1;
  session_id: string;
  source_task_id: string;
  fingerprint: string;
  performance_summary: {
    total_sets_planned: number;
    total_sets_logged: number;
    total_sets_completed: number;
    total_volume_kg: number | null;
    skipped_exercise_indices: number[];
    elapsed_sec: number;
  };
  exercise_deltas: Array<{
    exercise_index: number;
    name: string;
    planned_set_count: number;
    logged_set_count: number;
    completed_set_count: number;
    sets: Array<{
      set_index: number;
      planned: {
        weight: string | null;
        reps: string | null;
        target_label?: string | null;
      } | null;
      actual: {
        weight: string | null;
        reps: string | null;
        rpe: string | null;
        done: boolean;
      };
      status: SessionTelemetrySetDeltaStatus;
    }>;
  }>;
  live_set_counts: number[];
  interval_performance?: Array<{
    block_id: string;
    format: string;
    rounds_completed: number;
    rounds_target: number | null;
    last_phase: string;
    elapsed_in_block_sec: number;
  }>;
  elapsed_sec?: number;
  workout_log_task_id?: string | null;
  set_logs?: unknown[];
};

function asMetadataObject(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseSetDeltaStatus(value: unknown): SessionTelemetrySetDeltaStatus | null {
  if (value === 'done' || value === 'partial' || value === 'skipped' || value === 'not_started') {
    return value;
  }
  return null;
}

function parseSnapshotV1(raw: unknown): SessionTelemetrySnapshotV1 | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;
  if (typeof o.session_id !== 'string' || !o.session_id.trim()) return null;
  if (typeof o.source_task_id !== 'string' || !o.source_task_id.trim()) return null;
  if (typeof o.fingerprint !== 'string' || !o.fingerprint.trim()) return null;
  if (!Array.isArray(o.exercise_deltas) || !Array.isArray(o.live_set_counts)) return null;

  const ps = o.performance_summary;
  if (ps == null || typeof ps !== 'object' || Array.isArray(ps)) return null;
  const summary = ps as Record<string, unknown>;
  if (
    !isNumber(summary.total_sets_planned) ||
    !isNumber(summary.total_sets_logged) ||
    !isNumber(summary.total_sets_completed) ||
    !isNumber(summary.elapsed_sec) ||
    !Array.isArray(summary.skipped_exercise_indices)
  ) {
    return null;
  }

  const exercise_deltas: SessionTelemetrySnapshotV1['exercise_deltas'] = [];
  for (const row of o.exercise_deltas) {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) return null;
    const ex = row as Record<string, unknown>;
    if (
      !isNumber(ex.exercise_index) ||
      typeof ex.name !== 'string' ||
      !isNumber(ex.planned_set_count) ||
      !isNumber(ex.logged_set_count) ||
      !isNumber(ex.completed_set_count) ||
      !Array.isArray(ex.sets)
    ) {
      return null;
    }
    const sets: SessionTelemetrySnapshotV1['exercise_deltas'][number]['sets'] = [];
    for (const setRow of ex.sets) {
      if (setRow == null || typeof setRow !== 'object' || Array.isArray(setRow)) return null;
      const s = setRow as Record<string, unknown>;
      if (!isNumber(s.set_index)) return null;
      const status = parseSetDeltaStatus(s.status);
      if (!status) return null;
      const actual = s.actual;
      if (actual == null || typeof actual !== 'object' || Array.isArray(actual)) return null;
      const a = actual as Record<string, unknown>;
      sets.push({
        set_index: s.set_index,
        planned:
          s.planned == null
            ? null
            : (s.planned as SessionTelemetrySnapshotV1['exercise_deltas'][number]['sets'][number]['planned']),
        actual: {
          weight: typeof a.weight === 'string' || a.weight === null ? a.weight : null,
          reps: typeof a.reps === 'string' || a.reps === null ? a.reps : null,
          rpe: typeof a.rpe === 'string' || a.rpe === null ? a.rpe : null,
          done: a.done === true,
        },
        status,
      });
    }
    exercise_deltas.push({
      exercise_index: ex.exercise_index,
      name: ex.name,
      planned_set_count: ex.planned_set_count,
      logged_set_count: ex.logged_set_count,
      completed_set_count: ex.completed_set_count,
      sets,
    });
  }

  const live_set_counts: number[] = [];
  for (const n of o.live_set_counts) {
    if (!isNumber(n)) return null;
    live_set_counts.push(n);
  }

  const skipped: number[] = [];
  for (const idx of summary.skipped_exercise_indices) {
    if (!isNumber(idx)) return null;
    skipped.push(idx);
  }

  let interval_performance: SessionTelemetrySnapshotV1['interval_performance'];
  if (o.interval_performance != null) {
    if (!Array.isArray(o.interval_performance)) return null;
    interval_performance = [];
    for (const ir of o.interval_performance) {
      if (ir == null || typeof ir !== 'object' || Array.isArray(ir)) return null;
      const row = ir as Record<string, unknown>;
      if (
        typeof row.block_id !== 'string' ||
        typeof row.format !== 'string' ||
        !isNumber(row.rounds_completed) ||
        typeof row.last_phase !== 'string' ||
        !isNumber(row.elapsed_in_block_sec)
      ) {
        return null;
      }
      interval_performance.push({
        block_id: row.block_id,
        format: row.format,
        rounds_completed: row.rounds_completed,
        rounds_target:
          row.rounds_target === null || isNumber(row.rounds_target) ? row.rounds_target : null,
        last_phase: row.last_phase,
        elapsed_in_block_sec: row.elapsed_in_block_sec,
      });
    }
  }

  return {
    schema_version: 1,
    session_id: o.session_id,
    source_task_id: o.source_task_id,
    fingerprint: o.fingerprint,
    performance_summary: {
      total_sets_planned: summary.total_sets_planned,
      total_sets_logged: summary.total_sets_logged,
      total_sets_completed: summary.total_sets_completed,
      total_volume_kg:
        summary.total_volume_kg === null || isNumber(summary.total_volume_kg)
          ? summary.total_volume_kg
          : null,
      skipped_exercise_indices: skipped,
      elapsed_sec: summary.elapsed_sec,
    },
    exercise_deltas,
    live_set_counts,
    interval_performance,
    elapsed_sec: isNumber(o.elapsed_sec) ? o.elapsed_sec : summary.elapsed_sec,
    workout_log_task_id:
      o.workout_log_task_id === null || typeof o.workout_log_task_id === 'string'
        ? o.workout_log_task_id
        : null,
    set_logs: Array.isArray(o.set_logs) ? o.set_logs : undefined,
  };
}

export function parseSessionTelemetryFromMetadata(
  metadata: unknown,
): SessionTelemetrySnapshotV1 | null {
  const raw = asMetadataObject(metadata)[SESSION_TELEMETRY_METADATA_KEY];
  return parseSnapshotV1(raw);
}

export function isActiveSessionSurfaceFromMetadata(metadata: unknown): boolean {
  const o = asMetadataObject(metadata);
  const wctx = o.workout_context;
  if (wctx != null && typeof wctx === 'object' && !Array.isArray(wctx)) {
    return (wctx as Record<string, unknown>).surface === ACTIVE_SESSION_SURFACE_VALUE;
  }
  return false;
}

export function isActiveSessionSurfaceInThread(
  rowsChronologicalOldestFirst: ReadonlyArray<{ metadata?: unknown }>,
): boolean {
  for (let i = rowsChronologicalOldestFirst.length - 1; i >= 0; i -= 1) {
    if (isActiveSessionSurfaceFromMetadata(rowsChronologicalOldestFirst[i]?.metadata)) {
      return true;
    }
  }
  return false;
}

export function shouldSummarizeSessionTelemetry(opts: {
  rail: boolean;
  activeSession: boolean;
}): boolean {
  return opts.rail || opts.activeSession;
}

function formatElapsedMinutes(elapsedSec: number): string {
  const m = Math.max(0, Math.round(elapsedSec / 60));
  return `${m}m`;
}

function formatDurationMmSs(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s}s`;
}

function coerceTrimmedString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).trim();
  return '';
}

function formatPlannedTarget(
  planned: SessionTelemetrySnapshotV1['exercise_deltas'][number]['sets'][number]['planned'],
): string {
  if (!planned) return '—';
  const label = coerceTrimmedString(planned.target_label);
  if (label) return label;
  const w = coerceTrimmedString(planned.weight);
  const r = coerceTrimmedString(planned.reps);
  if (w && r) return `${w}x${r}`;
  if (r) return r;
  if (w) return w;
  return '—';
}

function formatActual(
  actual: SessionTelemetrySnapshotV1['exercise_deltas'][number]['sets'][number]['actual'],
): string {
  const w = coerceTrimmedString(actual.weight);
  const r = coerceTrimmedString(actual.reps);
  const rpe = coerceTrimmedString(actual.rpe);
  let base = '—';
  if (w && r) base = `${w}x${r}`;
  else if (r) base = r;
  else if (w) base = w;
  if (rpe) base += ` rpe${rpe}`;
  return base;
}

function shouldIncludeExercise(
  ex: SessionTelemetrySnapshotV1['exercise_deltas'][number],
  skippedIndices: readonly number[],
): boolean {
  if (skippedIndices.includes(ex.exercise_index)) return true;
  if (ex.logged_set_count > 0) return true;
  if (ex.completed_set_count > 0) return true;
  return ex.sets.some((s) => s.status !== 'not_started');
}

function buildSummaryLine(snapshot: SessionTelemetrySnapshotV1): string {
  const ps = snapshot.performance_summary;
  const elapsed = snapshot.elapsed_sec != null ? snapshot.elapsed_sec : ps.elapsed_sec;
  const volume = ps.total_volume_kg != null ? ` | volume_kg=${ps.total_volume_kg}` : '';
  return (
    `global_session_time_elapsed=${formatElapsedMinutes(elapsed)} | clock_scope=wall_time_since_session_start | sets_completed=${ps.total_sets_completed}/${ps.total_sets_planned}` +
    `${volume} | skipped_exercises=[${ps.skipped_exercise_indices.join(',')}]` +
    ` | live_set_counts=[${snapshot.live_set_counts.join(',')}] | fp=${snapshot.fingerprint}`
  );
}

function buildIntervalLines(snapshot: SessionTelemetrySnapshotV1): string[] {
  const rows = snapshot.interval_performance ?? [];
  if (rows.length === 0) return [];

  const lines = [SESSION_TELEMETRY_INTERVAL_HEADER];
  for (const row of rows) {
    const roundsTarget = row.rounds_target != null ? String(row.rounds_target) : 'null';
    lines.push(
      `block_id=${row.block_id} | format=${row.format} | rounds_completed=${row.rounds_completed} | rounds_target=${roundsTarget} | phase=${row.last_phase} | running_block_clock_elapsed=${formatDurationMmSs(row.elapsed_in_block_sec)} | clock_scope=block_local_NOT_global_session`,
    );
  }
  return lines;
}

function buildExerciseLines(snapshot: SessionTelemetrySnapshotV1): {
  lines: string[];
  omitted: number;
} {
  const skipped = snapshot.performance_summary.skipped_exercise_indices;
  const included: SessionTelemetrySnapshotV1['exercise_deltas'] = [];
  let omitted = 0;
  for (const ex of snapshot.exercise_deltas) {
    if (shouldIncludeExercise(ex, skipped)) {
      included.push(ex);
    } else {
      omitted += 1;
    }
  }

  const lines: string[] = [];
  for (const ex of included) {
    lines.push(
      `Ex${ex.exercise_index} ${ex.name} | planned=${ex.planned_set_count} logged=${ex.logged_set_count} done=${ex.completed_set_count}`,
    );
    for (const set of ex.sets) {
      const target = formatPlannedTarget(set.planned);
      if (set.status === 'not_started') {
        lines.push(`  s${set.set_index}: target ${target} -> [not_started]`);
        continue;
      }
      const actual = formatActual(set.actual);
      lines.push(`  s${set.set_index}: target ${target} -> actual ${actual} [${set.status}]`);
    }
  }
  return { lines, omitted };
}

function byteLengthUtf8(text: string): number {
  return new TextEncoder().encode(text).length;
}

function truncateLinesToByteCap(
  lines: string[],
  maxBytes: number,
): {
  kept: string[];
  truncatedExerciseOmitted: number;
} {
  const kept: string[] = [];
  let omittedFromExerciseTruncation = 0;
  for (const line of lines) {
    const candidate = kept.length === 0 ? line : `${kept.join('\n')}\n${line}`;
    if (byteLengthUtf8(candidate) <= maxBytes) {
      kept.push(line);
      continue;
    }
    if (line.startsWith('Ex')) {
      omittedFromExerciseTruncation += 1;
    }
  }
  return { kept, truncatedExerciseOmitted: omittedFromExerciseTruncation };
}

export function summarizeTelemetryDeltas(
  snapshot: SessionTelemetrySnapshotV1,
  maxBytes: number = SESSION_TELEMETRY_RAIL_MAX_BYTES,
): string {
  const headerLines = [SESSION_TELEMETRY_HEADER, buildSummaryLine(snapshot)];
  const intervalLines = buildIntervalLines(snapshot);
  const { lines: exerciseLines, omitted: notStartedOmitted } = buildExerciseLines(snapshot);

  const bodyLines = [...headerLines, ...intervalLines, ...exerciseLines];
  const { kept, truncatedExerciseOmitted } = truncateLinesToByteCap(bodyLines, maxBytes);
  const linesDropped = kept.length < bodyLines.length ? bodyLines.length - kept.length : 0;

  const totalOmitted = notStartedOmitted + truncatedExerciseOmitted + linesDropped;
  if (totalOmitted > 0) {
    const footer = `...(truncated: ${totalOmitted} lines omitted)`;
    while (
      kept.length > headerLines.length &&
      byteLengthUtf8([...kept, footer].join('\n')) > maxBytes
    ) {
      kept.pop();
    }
    const withFooter = [...kept, footer].join('\n');
    if (byteLengthUtf8(withFooter) <= maxBytes) return withFooter;
  }

  return kept.join('\n');
}

function compactJsonFallback(snapshot: SessionTelemetrySnapshotV1, maxBytes: number): string {
  const minimal = {
    schema_version: 1,
    fingerprint: snapshot.fingerprint,
    performance_summary: snapshot.performance_summary,
    live_set_counts: snapshot.live_set_counts,
    exercise_deltas: snapshot.exercise_deltas.map((ex) => ({
      exercise_index: ex.exercise_index,
      name: ex.name,
      logged_set_count: ex.logged_set_count,
      completed_set_count: ex.completed_set_count,
    })),
  };
  let json = JSON.stringify(minimal);
  if (byteLengthUtf8(json) <= maxBytes) {
    return `${SESSION_TELEMETRY_HEADER}\n${json}`;
  }
  json = json.slice(0, Math.max(0, maxBytes - 64)) + '...(truncated)';
  return `${SESSION_TELEMETRY_HEADER}\n${json}`;
}

export function formatSessionTelemetryForPrompt(
  snapshot: SessionTelemetrySnapshotV1,
  opts?: { rail?: boolean; activeSession?: boolean; maxBytes?: number },
): string {
  try {
    const summarize = shouldSummarizeSessionTelemetry({
      rail: opts?.rail === true,
      activeSession: opts?.activeSession === true,
    });
    const maxBytes =
      opts?.maxBytes ??
      (summarize ? SESSION_TELEMETRY_RAIL_MAX_BYTES : SESSION_TELEMETRY_FULL_MAX_BYTES);

    if (summarize) {
      return summarizeTelemetryDeltas(snapshot, maxBytes);
    }

    const summary = summarizeTelemetryDeltas(snapshot, maxBytes);
    if (summary.trim().length > SESSION_TELEMETRY_HEADER.length + 10) {
      return summary;
    }
    return compactJsonFallback(snapshot, maxBytes);
  } catch {
    return '';
  }
}
