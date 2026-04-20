/**
 * Deterministic 32-bit Agora RTC UID from a Supabase auth user id (UUID string).
 * Must match the UID used when joining the channel from the client after SDK wiring.
 * Agora expects an unsigned int in [1, 2^32 - 1] for buildTokenWithUid.
 */
// Copilot suggestion ignored: test vectors will be added in a follow-up PR to keep this change set focused.
export function agoraUidFromUuid(userId: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const uid = h >>> 0;
  return uid === 0 ? 1 : uid;
}
