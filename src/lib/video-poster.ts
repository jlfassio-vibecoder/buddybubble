/**
 * Client-side video poster (JPEG) for message attachments. Browser-only.
 */

/** Max width for poster canvas before JPEG export (keeps uploads small). */
export const VIDEO_POSTER_MAX_WIDTH = 640;

/** Reject poster blobs larger than this (after JPEG compression). */
export const VIDEO_POSTER_MAX_BYTES = 2 * 1024 * 1024;

export type VideoPosterResult = {
  blob: Blob;
  width: number;
  height: number;
  duration_sec: number;
};

export function posterCanvasDimensions(
  videoWidth: number,
  videoHeight: number,
  maxWidth: number = VIDEO_POSTER_MAX_WIDTH,
): { width: number; height: number } {
  if (
    !Number.isFinite(videoWidth) ||
    !Number.isFinite(videoHeight) ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return { width: maxWidth, height: Math.round((maxWidth * 9) / 16) };
  }
  if (videoWidth <= maxWidth) {
    return { width: Math.round(videoWidth), height: Math.round(videoHeight) };
  }
  const scale = maxWidth / videoWidth;
  return {
    width: maxWidth,
    height: Math.max(1, Math.round(videoHeight * scale)),
  };
}

function seekVideo(video: HTMLVideoElement, seconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ms = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onErr);
      reject(new Error('Video seek timed out.'));
    }, 15000);
    function onSeeked() {
      if (settled) return;
      settled = true;
      window.clearTimeout(ms);
      video.removeEventListener('error', onErr);
      resolve();
    }
    function onErr() {
      if (settled) return;
      settled = true;
      window.clearTimeout(ms);
      video.removeEventListener('seeked', onSeeked);
      reject(new Error('Video seek failed.'));
    }
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onErr, { once: true });
    try {
      video.currentTime = Math.max(0, seconds);
    } catch {
      if (!settled) {
        settled = true;
        window.clearTimeout(ms);
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onErr);
        reject(new Error('Video seek failed.'));
      }
    }
  });
}

/**
 * Load a video file, seek to a representative frame, and export a JPEG poster.
 */
/** Metadata-only (no poster): duration and intrinsic dimensions from the file. */
export async function getVideoFileMetadata(file: File): Promise<{
  width: number;
  height: number;
  duration_sec: number;
}> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('Video metadata timed out.')), 30000);
      video.onloadedmetadata = () => {
        window.clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(t);
        reject(new Error('Could not read video metadata.'));
      };
    });
    const rawW = video.videoWidth;
    const rawH = video.videoHeight;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    return {
      width: Math.round(rawW) || 0,
      height: Math.round(rawH) || 0,
      duration_sec: duration,
    };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

export async function captureVideoPoster(
  file: File,
  jpegQuality = 0.85,
): Promise<VideoPosterResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('Video load timed out.')), 60000);
      video.onloadedmetadata = () => {
        window.clearTimeout(t);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(t);
        reject(new Error('Could not read video file.'));
      };
    });

    const rawW = video.videoWidth;
    const rawH = video.videoHeight;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekSec = duration > 0 ? Math.min(0.25, duration * 0.1) : 0;

    try {
      await seekVideo(video, seekSec);
    } catch {
      await seekVideo(video, 0);
    }

    const { width: cw, height: ch } = posterCanvasDimensions(rawW, rawH);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create poster canvas.');

    ctx.drawImage(video, 0, 0, cw, ch);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', jpegQuality),
    );
    if (!blob) throw new Error('Could not encode video poster.');
    if (blob.size > VIDEO_POSTER_MAX_BYTES) {
      throw new Error('Video poster is too large. Try a shorter or smaller video.');
    }

    return {
      blob,
      width: Math.round(rawW) || cw,
      height: Math.round(rawH) || ch,
      duration_sec: duration,
    };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
