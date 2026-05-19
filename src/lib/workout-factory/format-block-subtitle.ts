/**
 * Pure presentation helper: parametric blockFormat + formatParams → human-readable subtitle.
 * Used by RichWorkoutReadView and any future workout block headings.
 */

function positiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n > 0 ? n : null;
}

function formatAmrap(params: Record<string, unknown>): string {
  const cap = positiveInt(params.time_cap_minutes);
  return cap != null ? `${cap} Min AMRAP` : 'AMRAP';
}

function formatEmom(params: Record<string, unknown>): string {
  const interval = positiveInt(params.interval_seconds);
  const totalMinutes = positiveInt(params.total_minutes);
  const totalRounds = positiveInt(params.total_rounds);
  const intervalLabel = interval != null ? ` (Every ${interval}s)` : '';
  if (totalMinutes != null) {
    return `${totalMinutes} Min EMOM${intervalLabel}`;
  }
  if (totalRounds != null) {
    return `${totalRounds} Rounds EMOM${intervalLabel}`;
  }
  return interval != null ? `EMOM (Every ${interval}s)` : 'EMOM';
}

function formatTabata(params: Record<string, unknown>): string {
  const rounds = positiveInt(params.rounds);
  const work = positiveInt(params.work_seconds);
  const rest = positiveInt(params.rest_seconds);
  if (rounds != null && work != null && rest != null) {
    return `Tabata · ${rounds} Rounds (${work}/${rest}s)`;
  }
  if (rounds != null) {
    return `Tabata · ${rounds} Rounds`;
  }
  return 'Tabata';
}

function formatRoundsLabel(formatLabel: string, params: Record<string, unknown>): string {
  const rounds = positiveInt(params.rounds);
  return rounds != null ? `${formatLabel} · ${rounds} Rounds` : formatLabel;
}

function formatLadder(params: Record<string, unknown>): string {
  const start = positiveInt(params.start_reps);
  const peak = positiveInt(params.peak_reps);
  const direction =
    typeof params.direction === 'string' ? params.direction.trim().toLowerCase() : 'ascending';
  if (start != null && peak != null) {
    if (direction === 'descending') {
      return `Ladder · ${peak}→${start}`;
    }
    return `Ladder · ${start}→${peak}`;
  }
  return 'Ladder';
}

function formatChipper(params: Record<string, unknown>): string {
  const cap = positiveInt(params.time_cap_minutes);
  if (cap != null) return `Chipper · ${cap} Min`;
  return 'Chipper';
}

function formatPyramid(params: Record<string, unknown>): string {
  const start = positiveInt(params.start_reps);
  const peak = positiveInt(params.peak_reps);
  const direction =
    typeof params.direction === 'string' ? params.direction.trim().toLowerCase() : 'ascending';
  if (start != null && peak != null) {
    if (direction === 'descending') {
      return `Pyramid · ${peak}→${start}`;
    }
    return `Pyramid · ${start}→${peak}`;
  }
  return 'Pyramid';
}

function formatClusters(params: Record<string, unknown>): string {
  const clusters = positiveInt(params.clusters);
  const reps = positiveInt(params.reps_per_cluster);
  if (clusters != null && reps != null) {
    return `Clusters · ${clusters}×${reps}`;
  }
  return 'Clusters';
}

function formatDropSets(params: Record<string, unknown>): string {
  const dropPercent = positiveInt(params.drop_percent);
  const drops = positiveInt(params.drops);
  if (dropPercent != null && drops != null) {
    return `Drop sets · ${dropPercent}% × ${drops}`;
  }
  return 'Drop sets';
}

/**
 * Returns a display subtitle for a parametric exercise block, or null when none should show.
 */
export function formatBlockSubtitle(
  blockFormat: string | null | undefined,
  formatParams: Record<string, unknown> | null | undefined,
): string | null {
  const format = typeof blockFormat === 'string' ? blockFormat.trim().toLowerCase() : '';
  if (!format || format === 'straight_sets') return null;

  const params =
    formatParams != null && typeof formatParams === 'object' && !Array.isArray(formatParams)
      ? formatParams
      : {};

  switch (format) {
    case 'amrap':
      return formatAmrap(params);
    case 'emom':
      return formatEmom(params);
    case 'tabata':
      return formatTabata(params);
    case 'superset':
      return formatRoundsLabel('Superset', params);
    case 'circuit':
      return formatRoundsLabel('Circuit', params);
    case 'ladder':
      return formatLadder(params);
    case 'chipper':
      return formatChipper(params);
    case 'pyramid':
      return formatPyramid(params);
    case 'contrast':
      return formatRoundsLabel('Contrast', params);
    case 'clusters':
      return formatClusters(params);
    case 'drop_sets':
      return formatDropSets(params);
    default:
      return null;
  }
}
