import type { TaskRow } from '@/types/database';

/**
 * Client-side Kanban keyword filter: match title / description / shallow focus
 * metadata — never nested exercise lists.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Basic English plural variants for matching only (not full stemming). */
export function textFilterTokenVariants(token: string): string[] {
  const t = token.trim().toLowerCase();
  if (!t) return [];
  const out = new Set<string>([t]);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) {
    out.add(t.slice(0, -1));
  } else if (t.length >= 3 && !t.endsWith('s')) {
    out.add(`${t}s`);
  }
  return [...out];
}

export function haystackContainsWordToken(haystack: string, token: string): boolean {
  const variants = textFilterTokenVariants(token);
  if (variants.length === 0) return false;
  const text = haystack.toLowerCase();
  for (const v of variants) {
    const re = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(v)}(?:[^a-z0-9]|$)`, 'i');
    if (re.test(text)) return true;
  }
  return false;
}

function readWorkoutTypeFromMetadata(metadata: TaskRow['metadata']): string | null {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const wt = (metadata as Record<string, unknown>).workout_type;
  if (typeof wt !== 'string') return null;
  const trimmed = wt.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Collect searchable strings — title, description, workout_type only. */
export function collectTaskTextFilterHaystacks(task: TaskRow): string[] {
  const out: string[] = [];
  const title = typeof task.title === 'string' ? task.title.trim() : '';
  if (title) out.push(title);
  const description = typeof task.description === 'string' ? task.description.trim() : '';
  if (description) out.push(description);
  const workoutType = readWorkoutTypeFromMetadata(task.metadata);
  if (workoutType) out.push(workoutType);
  return out;
}

/**
 * Returns true when `query` is empty, or when any whitespace-separated token
 * matches as a word (with basic plural variants) in title, description, or
 * metadata.workout_type.
 */
export function taskMatchesTextFilter(task: TaskRow, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystacks = collectTaskTextFilterHaystacks(task);
  if (haystacks.length === 0) return false;
  const combined = haystacks.join('\n');
  return tokens.some((token) => haystackContainsWordToken(combined, token));
}
