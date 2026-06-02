let chimeAudio: HTMLAudioElement | null = null;

/** Short success tone after Slap Target tap (best-effort; no-op if blocked). */
export function playSlapChime(): void {
  if (typeof window === 'undefined') return;
  try {
    if (!chimeAudio) {
      chimeAudio = new Audio(
        'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGWi77+efTRAMUKfj8LZjHAY4kdfyzHksBSR3x/DdkEAKFF606euoVRQKRp/g8r5sIQUrgc7y2Yk2CBlou+/nn00QDFCn4/C2YxwGOJHX8sx5LAUkd8fw3ZBAC',
      );
      chimeAudio.volume = 0.35;
    }
    void chimeAudio.play().catch(() => {});
  } catch {
    // ignore
  }
}

export function vibrateSlapTarget(): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate([50]);
  }
}
