import type { RichMessageComposerExercise } from '@/components/chat/RichMessageComposer';

const slugifyForMatch = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Ranks and filters `exercises` for `#` search. Empty `searchQuery` returns all, sorted by name.
 */
export function rankExercisesForHashQuery(
  exercises: RichMessageComposerExercise[],
  searchQuery: string,
): RichMessageComposerExercise[] {
  const q = searchQuery.trim().toLowerCase();
  const qWords = q.split(/\s+/).filter(Boolean);
  if (!q) {
    return [...exercises].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }

  const scoreFor = (e: RichMessageComposerExercise): number => {
    const name = e.name.toLowerCase();
    const slug = (e.slug ?? '').toLowerCase();
    const slugish = slugifyForMatch(e.name);
    if (name === q) return 1_000_000;
    if (slug && slug === slugifyForMatch(q)) return 900_000;
    if (name.startsWith(q)) return 800_000;
    if (qWords.length > 1) {
      let pos = 0;
      let ok = true;
      for (const qw of qWords) {
        const idx = name.indexOf(qw, pos);
        if (idx < 0) {
          ok = false;
          break;
        }
        pos = idx + qw.length;
      }
      if (ok) return 600_000 - name.length;
    }
    if (qWords.every((qw) => name.includes(qw))) return 400_000;
    if (name.includes(q)) return 200_000;
    if (slug && slug.replace(/-/g, ' ').includes(q.replace(/\s+/g, ' '))) return 100_000;
    return 0;
  };

  return exercises
    .map((e) => ({ e, s: scoreFor(e) }))
    .filter((x) => x.s > 0)
    .sort(
      (a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name, undefined, { sensitivity: 'base' }),
    )
    .map((x) => x.e);
}

/**
 * If the user finished inserting a canonical name and a trailing space is present, hide the popover
 * (same insert path as `#{name} `) without needing structured metadata.
 */
export function shouldSuppressHashPopoverAfterSelection(
  rawQuery: string,
  knownExactNames: ReadonlySet<string>,
): boolean {
  if (!rawQuery) return false;
  const trimmed = rawQuery.trim();
  if (!trimmed) return false;
  if (rawQuery.length > trimmed.length && knownExactNames.has(trimmed.toLowerCase())) {
    return true;
  }
  return false;
}
