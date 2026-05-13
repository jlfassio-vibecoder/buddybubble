/**
 * Agora mix-mode cloud recording canvas: `transcodingConfig` width/height (no simple AR enum in API).
 * Keep in sync with `supabase/functions/_shared/aspect-ratio.ts` for the edge function.
 */
export type RecordingCanvasAspectRatio = '16:9' | '9:16' | '1:1';

export function parseAspectRatio(raw: unknown): RecordingCanvasAspectRatio {
  return raw === '9:16' || raw === '1:1' ? raw : '16:9';
}

export function aspectRatioToCanvas(ar: RecordingCanvasAspectRatio): {
  width: number;
  height: number;
} {
  switch (ar) {
    case '9:16':
      return { width: 720, height: 1280 };
    case '1:1':
      return { width: 720, height: 720 };
    case '16:9':
    default:
      return { width: 1280, height: 720 };
  }
}
