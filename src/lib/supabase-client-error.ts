/** Safe string for client-side logs (avoid dumping full PostgREST / storage error objects). */
export function supabaseClientErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return 'Unknown error';
}
