/**
 * Deterministic 32-bit Agora RTC UID (matches `src/lib/live-video/agora-uid.ts`).
 * Used for recording-bot UID derivation and collision checks against host UIDs.
 */
export function agoraUidFromUuid(userId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const uid = h >>> 0;
  return uid === 0 ? 1 : uid;
}

/** Stable bot UID for cloud recording; avoids collision with `hostAgoraUid` when possible. */
export function agoraRecordingBotUid(classInstanceId: string, hostAgoraUid: number): number {
  const base = agoraUidFromUuid(`agora-cloud-recording:${classInstanceId}`);
  if (base !== hostAgoraUid) return base;
  const bumped = (base + 0x13579bdf) >>> 0;
  return bumped === 0 ? 2 : bumped;
}
