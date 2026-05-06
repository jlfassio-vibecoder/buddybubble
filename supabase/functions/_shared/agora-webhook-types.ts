/**
 * Agora Notifications (NCS) webhook body for Cloud Recording.
 * @see https://docs.agora.io/en/cloud-recording/develop/receive-notifications
 */

export const AGORA_CLOUD_RECORDING_PRODUCT_ID = 3;

/** Top-level NCS envelope */
export type AgoraNcsEnvelope = {
  noticeId: string;
  productId: number;
  eventType: number;
  notifyMs?: number;
  payload: AgoraCloudRecordingPayload;
};

export type AgoraCloudRecordingPayload = {
  cname: string;
  uid: string;
  sid: string;
  sequence: number;
  sendts: number;
  serviceType: number;
  details: Record<string, unknown>;
};

export type UploadedFileEntry = {
  fileName: string;
  trackType?: string;
  uid?: string;
  mixedAllUser?: boolean;
  isPlayable?: boolean;
  sliceStartTime?: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

// Copilot suggestion ignored: dedicated unit tests for NCS coercions/fileList variants are deferred; query-response parser tests cover the parallel filename extraction paths for reconciler.
export function parseAgoraNcsEnvelope(raw: unknown): AgoraNcsEnvelope | null {
  if (!isRecord(raw)) return null;
  const noticeId = typeof raw.noticeId === 'string' ? raw.noticeId.trim() : '';
  const productId =
    typeof raw.productId === 'number'
      ? raw.productId
      : typeof raw.productId === 'string' && /^\d+$/.test(raw.productId)
        ? parseInt(raw.productId, 10)
        : Number.NaN;
  const eventType =
    typeof raw.eventType === 'number'
      ? raw.eventType
      : typeof raw.eventType === 'string' && /^-?\d+$/.test(raw.eventType)
        ? parseInt(raw.eventType, 10)
        : Number.NaN;
  const payloadRaw = raw.payload;
  if (!noticeId || !Number.isFinite(productId) || !Number.isFinite(eventType)) return null;
  if (!isRecord(payloadRaw)) return null;

  const cname = typeof payloadRaw.cname === 'string' ? payloadRaw.cname.trim() : '';
  const uidRaw = payloadRaw.uid;
  const uid =
    typeof uidRaw === 'string'
      ? uidRaw.trim()
      : typeof uidRaw === 'number' && Number.isFinite(uidRaw)
        ? String(uidRaw)
        : '';
  const sid = typeof payloadRaw.sid === 'string' ? payloadRaw.sid.trim() : '';
  const sequence =
    typeof payloadRaw.sequence === 'number'
      ? payloadRaw.sequence
      : typeof payloadRaw.sequence === 'string' && /^\d+$/.test(payloadRaw.sequence)
        ? parseInt(payloadRaw.sequence, 10)
        : Number.NaN;
  const sendtsRaw = payloadRaw.sendts;
  const sendts =
    typeof sendtsRaw === 'number'
      ? sendtsRaw
      : typeof sendtsRaw === 'string' && /^\d+$/.test(sendtsRaw)
        ? parseInt(sendtsRaw, 10)
        : 0;
  const serviceType =
    typeof payloadRaw.serviceType === 'number'
      ? payloadRaw.serviceType
      : typeof payloadRaw.serviceType === 'string' && /^\d+$/.test(payloadRaw.serviceType)
        ? parseInt(payloadRaw.serviceType, 10)
        : Number.NaN;
  const details = payloadRaw.details;

  if (!cname || !uid || !sid || !Number.isFinite(sequence)) return null;
  if (!Number.isFinite(serviceType)) return null;
  if (!isRecord(details)) return null;

  return {
    noticeId,
    productId,
    eventType,
    ...(typeof raw.notifyMs === 'number' ? { notifyMs: raw.notifyMs } : {}),
    payload: {
      cname,
      uid,
      sid,
      sequence,
      sendts,
      serviceType,
      details,
    },
  };
}

/** Parse `details.fileList` as string, JSON string, or array of entries with `fileName`. */
export function extractFileNamesFromDetails(details: Record<string, unknown>): string[] {
  const raw = details.fileList;
  if (raw == null) return [];

  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t) as unknown;
        return fileNamesFromFileListValue(parsed);
      } catch {
        return [t];
      }
    }
    return [t];
  }

  return fileNamesFromFileListValue(raw);
}

function fileNamesFromFileListValue(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const fn = item.fileName;
    if (typeof fn === 'string' && fn.trim()) out.push(fn.trim());
  }
  return out;
}

export function pickPlaybackFileName(fileNames: string[]): string | null {
  const lower = (s: string) => s.toLowerCase();
  const mp4 = fileNames.find((f) => lower(f).endsWith('.mp4'));
  if (mp4) return mp4.replace(/^\/+/, '');
  const m3u8 = fileNames.find((f) => lower(f).endsWith('.m3u8'));
  if (m3u8) return m3u8.replace(/^\/+/, '');
  return fileNames[0] ? fileNames[0].replace(/^\/+/, '') : null;
}
