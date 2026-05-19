/** Rightmost `/` that starts a `/task` token (after start or whitespace), not slashes inside e.g. `https://`. */
export function lastTaskMentionSlashIndex(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== '/') continue;
    if (i === 0) return 0;
    const before = s[i - 1];
    if (before === ' ' || before === '\n' || before === '\r' || before === '\t') return i;
  }
  return -1;
}

/** Rightmost `:` that starts a `:block` token (after start or whitespace), not `:` in e.g. `10:30`. */
export function lastBlockColonIndex(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== ':') continue;
    if (i === 0) return 0;
    const before = s[i - 1];
    if (before === ' ' || before === '\n' || before === '\r' || before === '\t') return i;
    if (/\d/.test(before)) continue;
  }
  return -1;
}

/** Rightmost `#` that starts a `#exercise` token (after start or whitespace), not `#` inside e.g. `foo#bar`. */
export function lastExerciseHashIndex(s: string): number {
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] !== '#') continue;
    if (i === 0) return 0;
    const before = s[i - 1];
    if (before === ' ' || before === '\n' || before === '\r' || before === '\t') return i;
  }
  return -1;
}

export const HASH_QUERY_MAX_WORDS = 4;
export const HASH_QUERY_MAX_CHARS = 64;

/**
 * Active `#` token: multi-word search up to {@link HASH_QUERY_MAX_WORDS} and {@link HASH_QUERY_MAX_CHARS}
 * (after `#`). `searchQuery` is what the list filters on; `rawQuery` is the full slice to the cursor
 * (used to close the popover after a canonical pick with a trailing space).
 */
export function parseHashTriggerQuery(textBeforeCursor: string): {
  start: number;
  searchQuery: string;
  rawQuery: string;
} | null {
  const lastHash = lastExerciseHashIndex(textBeforeCursor);
  if (lastHash < 0) return null;
  let rawQuery = textBeforeCursor.slice(lastHash + 1);
  const nl = rawQuery.indexOf('\n');
  if (nl !== -1) {
    rawQuery = rawQuery.slice(0, nl);
  }
  if (rawQuery.length > HASH_QUERY_MAX_CHARS) return null;
  // Double space ends the token (explicit cancel / "done" gesture).
  if (rawQuery.includes('  ')) return null;
  const trimmed = rawQuery.trim();
  const words = trimmed === '' ? [] : trimmed.split(/\s+/);
  if (words.length > HASH_QUERY_MAX_WORDS) return null;
  const searchQuery = words.slice(0, HASH_QUERY_MAX_WORDS).join(' ').slice(0, HASH_QUERY_MAX_CHARS);
  return { start: lastHash, searchQuery, rawQuery };
}

/**
 * Active `:` token: single-token filter on section and/or format (e.g. `finisher`, `amrap`, `finisher/amrap`).
 * No spaces inside the token.
 */
export function parseBlockTriggerQuery(textBeforeCursor: string): {
  start: number;
  query: string;
} | null {
  const lastColon = lastBlockColonIndex(textBeforeCursor);
  if (lastColon < 0) return null;
  let rawQuery = textBeforeCursor.slice(lastColon + 1);
  const nl = rawQuery.indexOf('\n');
  if (nl !== -1) rawQuery = rawQuery.slice(0, nl);
  if (rawQuery.includes(' ')) return null;
  return { start: lastColon, query: rawQuery };
}

export type ActiveComposerTrigger =
  | { kind: 'mention'; start: number; query: string }
  | { kind: 'slash'; start: number; query: string }
  | { kind: 'hash'; start: number; query: string; rawQuery: string }
  | { kind: 'block'; start: number; query: string };

/**
 * Among valid @, /, and # triggers in `textBeforeCursor`, returns the one whose start index is
 * largest (closest to the cursor). `@` and `/` keep a single token without spaces; `#` allows
 * multi-word search using {@link parseHashTriggerQuery}.
 */
export function resolveActiveComposerTrigger(
  textBeforeCursor: string,
  opts: {
    enableAt: boolean;
    enableSlash: boolean;
    enableHash: boolean;
    enableBlock?: boolean;
  },
): ActiveComposerTrigger | null {
  const candidates: ActiveComposerTrigger[] = [];

  if (opts.enableAt) {
    const lastAt = textBeforeCursor.lastIndexOf('@');
    if (lastAt !== -1) {
      const charBeforeAt = lastAt > 0 ? textBeforeCursor[lastAt - 1]! : ' ';
      if (charBeforeAt === ' ' || charBeforeAt === '\n') {
        const query = textBeforeCursor.substring(lastAt + 1);
        if (!query.includes(' ')) {
          candidates.push({ kind: 'mention', start: lastAt, query });
        }
      }
    }
  }

  if (opts.enableSlash) {
    const lastSlash = lastTaskMentionSlashIndex(textBeforeCursor);
    if (lastSlash !== -1) {
      const query = textBeforeCursor.substring(lastSlash + 1);
      if (!query.includes(' ')) {
        candidates.push({ kind: 'slash', start: lastSlash, query });
      }
    }
  }

  if (opts.enableHash) {
    const parsed = parseHashTriggerQuery(textBeforeCursor);
    if (parsed) {
      candidates.push({
        kind: 'hash',
        start: parsed.start,
        query: parsed.searchQuery,
        rawQuery: parsed.rawQuery,
      });
    }
  }

  if (opts.enableBlock) {
    const parsed = parseBlockTriggerQuery(textBeforeCursor);
    if (parsed) {
      candidates.push({
        kind: 'block',
        start: parsed.start,
        query: parsed.query,
      });
    }
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.start >= b.start ? a : b));
}
