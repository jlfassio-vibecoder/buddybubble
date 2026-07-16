/**
 * Pure helpers for Solo Studio browser capture (getDisplayMedia + MediaRecorder).
 * Keep DOM APIs here so the React hook stays thin and mime/blob logic is unit-testable.
 */

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
] as const;

/** Prefer VP9+Opus WebM; fall back to VP8 or plain WebM; empty string = browser default. */
export function pickMediaRecorderMimeType(
  isTypeSupported: (mimeType: string) => boolean = (m) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
): string {
  for (const mime of MIME_CANDIDATES) {
    if (isTypeSupported(mime)) return mime;
  }
  return '';
}

export function assembleRecorderBlob(chunks: Blob[], mimeType: string): Blob {
  const type = mimeType.trim() || chunks[0]?.type || 'video/webm';
  return new Blob(chunks, { type });
}

export type SoloStudioMixedStreamResult = {
  stream: MediaStream;
  audioContext: AudioContext | null;
  cleanup: () => void;
};

/**
 * Combine display video with mixed display+mic audio into one MediaStream for MediaRecorder.
 * Mic is optional — if null/empty, display audio alone (or silent destination) is used.
 */
export function buildSoloStudioMixedStream(
  display: MediaStream,
  mic: MediaStream | null,
): SoloStudioMixedStreamResult {
  const videoTrack = display.getVideoTracks()[0];
  if (!videoTrack) {
    throw new Error('Display capture has no video track.');
  }

  const AudioCtx =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;

  const hasDisplayAudio = display.getAudioTracks().length > 0;
  const hasMicAudio = Boolean(mic && mic.getAudioTracks().length > 0);

  if (!AudioCtx || (!hasDisplayAudio && !hasMicAudio)) {
    const tracks: MediaStreamTrack[] = [videoTrack];
    for (const t of display.getAudioTracks()) tracks.push(t);
    if (mic) {
      for (const t of mic.getAudioTracks()) tracks.push(t);
    }
    const stream = new MediaStream(tracks);
    return {
      stream,
      audioContext: null,
      cleanup: () => {
        for (const t of display.getTracks()) t.stop();
        if (mic) {
          for (const t of mic.getTracks()) t.stop();
        }
      },
    };
  }

  const audioContext = new AudioCtx();
  const destination = audioContext.createMediaStreamDestination();

  if (hasDisplayAudio) {
    const displaySource = audioContext.createMediaStreamSource(display);
    displaySource.connect(destination);
  }
  if (hasMicAudio && mic) {
    const micSource = audioContext.createMediaStreamSource(mic);
    micSource.connect(destination);
  }

  const stream = new MediaStream([videoTrack, ...destination.stream.getAudioTracks()]);

  return {
    stream,
    audioContext,
    cleanup: () => {
      for (const t of display.getTracks()) t.stop();
      if (mic) {
        for (const t of mic.getTracks()) t.stop();
      }
      for (const t of stream.getTracks()) {
        if (t.readyState !== 'ended') t.stop();
      }
      void audioContext.close().catch(() => {
        /* ignore */
      });
    },
  };
}
