/**
 * True when PostgREST/Postgres rejected a read/write because a column is absent from the DB
 * or from the schema cache (migration not applied). Matches several server message shapes.
 */
export function isMissingColumnSchemaCacheError(err: unknown, column: string): boolean {
  const text = postgrestErrorText(err);
  if (!text) return false;
  const lower = text.toLowerCase();
  const col = column.toLowerCase();
  if (!lower.includes(col)) return false;

  return (
    lower.includes('schema cache') ||
    lower.includes('could not find') ||
    lower.includes('does not exist') ||
    lower.includes('undefined column') ||
    (lower.includes('column') && lower.includes('not exist'))
  );
}

function postgrestErrorText(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const e = err as Record<string, unknown>;
  const parts = [e.message, e.details, e.hint].filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  );
  return parts.join(' ');
}
