/**
 * Dynamic import so `agora-rtc-sdk-ng` is not pulled into the server bundle or the initial dashboard chunk.
 */
export async function loadAgoraRTC() {
  const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
  return AgoraRTC;
}
