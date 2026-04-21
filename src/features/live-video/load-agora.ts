/**
 * Dynamic import so `agora-rtc-sdk-ng` is not pulled into the server bundle or the initial dashboard chunk.
 *
 * Retries on ChunkLoadError: dev HMR and occasional race conditions can invalidate async chunk URLs
 * while the tab still references the old manifest.
 */

function isLikelyChunkLoadFailure(err: unknown): boolean {
  if (err == null) return false;
  if (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: string }).name === 'ChunkLoadError'
  ) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('ChunkLoadError') || msg.includes('Loading chunk');
}

async function withChunkRetry<T>(loader: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await loader();
    } catch (e) {
      last = e;
      if (!isLikelyChunkLoadFailure(e) || i === attempts - 1) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  throw last;
}

export async function loadAgoraRTC() {
  const mod = await withChunkRetry(
    () =>
      import(
        /* webpackChunkName: "agora-rtc-sdk-ng" */
        'agora-rtc-sdk-ng'
      ),
  );
  return mod.default;
}
