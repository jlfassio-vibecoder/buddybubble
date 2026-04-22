/** Safe string for client-side logs (avoid dumping full PostgREST / storage error objects). */
export function supabaseClientErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === 'string' && m.length > 0) return m;
  }
  return 'Unknown error';
}

/**
 * Some browser environments abort in-flight fetch/lock work when a newer request
 * preempts an older one (e.g. Web Locks `steal: true`, React StrictMode double-mount).
 * These are not actionable user errors; callers should treat them like cancellation.
 */
export function isSupabaseBenignRequestAbort(err: unknown): boolean {
  const msg = supabaseClientErrorMessage(err);
  if (msg === 'AbortError: The user aborted a request.') return true;
  if (msg.startsWith('AbortError:')) {
    if (msg.includes("Lock broken by another request with the 'steal' option")) return true;
    if (msg.toLowerCase().includes('signal is aborted')) return true;
    if (msg.toLowerCase().includes('aborted')) return true;
  }
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = (err as { name?: unknown }).name;
    if (name === 'AbortError') return true;
  }
  return false;
}
