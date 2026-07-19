/**
 * Fuzzy match helpers for Coach structural_patch ids.
 * Deno mirror of `src/lib/agents/_shared/workout-metadata/structural-id-match.ts`.
 */

/** Normalize an id or display name for structural matching. */
export function normalizeStructuralToken(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/['']/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  // Strip common model suffixes: -block-id, -exercise-id, -id
  s = s.replace(/-(?:block|exercise)-id$/g, '');
  s = s.replace(/-id$/g, '');
  return s;
}

/** True when tokens are equal or one meaningfully contains the other. */
export function structuralTokensMatch(a: string, b: string): boolean {
  const na = normalizeStructuralToken(a);
  const nb = normalizeStructuralToken(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Require a minimum length so "main" does not match everything.
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  return false;
}

export function blockDisplayName(block: Record<string, unknown>): string {
  if (typeof block.name === 'string' && block.name.trim()) return block.name.trim();
  if (typeof block.exerciseName === 'string' && block.exerciseName.trim()) {
    return block.exerciseName.trim();
  }
  return '';
}

export function exerciseDisplayName(ex: Record<string, unknown>): string {
  if (typeof ex.exerciseName === 'string' && ex.exerciseName.trim()) return ex.exerciseName.trim();
  if (typeof ex.name === 'string' && ex.name.trim()) return ex.name.trim();
  return '';
}

/** Exact id, else name / slug match against block display name. */
export function blockMatchesStructuralId(
  block: Record<string, unknown>,
  resolvedId: string,
  patchBlockId: string,
): boolean {
  const want = patchBlockId.trim();
  if (!want) return false;
  if (resolvedId === want) return true;
  if (typeof block.id === 'string' && block.id.trim() === want) return true;
  const name = blockDisplayName(block);
  if (name && structuralTokensMatch(name, want)) return true;
  return false;
}

/** Exact exercise id, synthetic `${blockId}:eN`, or name / slug match. */
export function exerciseMatchesStructuralId(
  ex: Record<string, unknown>,
  blockId: string,
  index: number,
  patchExerciseId: string,
): boolean {
  const want = patchExerciseId.trim();
  if (!want) return false;
  if (typeof ex.id === 'string' && ex.id.trim() === want) return true;
  if (`${blockId}:e${index}` === want) return true;
  const name = exerciseDisplayName(ex);
  if (name && structuralTokensMatch(name, want)) return true;
  return false;
}
