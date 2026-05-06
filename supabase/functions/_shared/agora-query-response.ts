/**
 * Parse Agora Cloud Recording `query` REST response for uploaded filenames.
 * Response uses `filename` (see Agora docs); NCS webhooks use `fileName`.
 */

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function pushFileName(out: Set<string>, raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return;
  out.add(raw.trim().replace(/^\/+/, ''));
}

/** Walk nested objects/arrays for string values that look like media files. */
function collectMediaLikeStrings(v: unknown, out: Set<string>, depth = 0) {
  if (depth > 12) return;
  if (typeof v === 'string') {
    const s = v.trim();
    if (/\.(mp4|m3u8|ts)(\?|$)/i.test(s)) out.add(s.replace(/^\/+/, ''));
    return;
  }
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    for (const item of v) collectMediaLikeStrings(item, out, depth + 1);
    return;
  }
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    const val = o[k];
    if (k === 'filename' || k === 'fileName') pushFileName(out, val);
    else collectMediaLikeStrings(val, out, depth + 1);
  }
}

/**
 * Extract candidate file paths/names from Agora `query` JSON body.
 */
export function extractFileNamesFromAgoraQueryResponse(body: unknown): string[] {
  if (!isRecord(body)) return [];
  const sr = body.serverResponse;
  if (!isRecord(sr)) return [];

  const out = new Set<string>();

  const ess = sr.extensionServiceState;
  if (Array.isArray(ess)) {
    for (const svc of ess) {
      if (!isRecord(svc)) continue;
      const payload = svc.payload;
      if (!isRecord(payload)) continue;
      const fl = payload.fileList;
      if (Array.isArray(fl)) {
        for (const item of fl) {
          if (!isRecord(item)) continue;
          pushFileName(out, item.filename);
          pushFileName(out, item.fileName);
        }
      } else if (typeof fl === 'string') {
        pushFileName(out, fl);
      }
    }
  }

  collectMediaLikeStrings(sr, out);

  return [...out];
}

export function pickQueryPlaybackFileName(fileNames: string[]): string | null {
  const lower = (s: string) => s.toLowerCase();
  const mp4 = fileNames.find((f) => lower(f).endsWith('.mp4'));
  if (mp4) return mp4;
  const m3u8 = fileNames.find((f) => lower(f).endsWith('.m3u8'));
  if (m3u8) return m3u8;
  return fileNames[0] ?? null;
}

/**
 * Heuristic: Agora `serverResponse.status` in query — when non-zero, session may still be active.
 * We still prefer fileList presence for readiness.
 */
export function agoraQueryServerStatus(body: unknown): number | null {
  if (!isRecord(body)) return null;
  const sr = body.serverResponse;
  if (!isRecord(sr)) return null;
  const st = sr.status;
  if (typeof st === 'number' && Number.isFinite(st)) return st;
  if (typeof st === 'string' && /^-?\d+$/.test(st)) return parseInt(st, 10);
  return null;
}
