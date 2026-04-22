import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { fetchOutline, isValidOutline } from '../lib/fetchOutline';
import { getTurnstileToken, isTurnstileConfigured, resetTurnstile } from '../lib/turnstile';
import { buildOutlineProfile, outlineFingerprint } from '../lib/outlineFingerprint';

/**
 * Owns the PhaseOutline fetch lifecycle:
 *  - On enable (phase entry) with a cached preview whose fingerprint matches
 *    the current profile → status='ready', no network call.
 *  - On enable with no cache / fingerprint mismatch → fires a fetch.
 *  - Unmount or `enabled` going false → abort in-flight request.
 *  - `regenerate()` force-runs, bypassing cache.
 *
 * State surface is intentionally thin so PhaseOutline can be a pure render.
 */
export function useOutlineGeneration({ enabled, draft, updateDraft }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);
  const [outlineEpoch, bumpOutlineEpoch] = useReducer((n) => n + 1, 0);

  const abortRef = useRef(null);
  const actedOnFpRef = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const currentFp = outlineFingerprint(draft);
  const cachedPreview = draft?.fitnessAiPreview;
  const cachedFp = draft?.fitnessAiPreviewFingerprint;
  const cacheHit = Boolean(
    currentFp && isValidOutline(cachedPreview) && cachedFp && cachedFp === currentFp,
  );
  const cachedValidPreview = isValidOutline(cachedPreview) ? cachedPreview : null;

  const run = useCallback(async () => {
    const fpAtStart = outlineFingerprint(draftRef.current);
    if (!fpAtStart) return;

    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        // ignore
      }
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('loading');
    setError(null);

    let turnstileToken = null;
    if (isTurnstileConfigured()) {
      try {
        turnstileToken = await getTurnstileToken();
      } catch (e) {
        if (controller.signal.aborted) return;
        const turnstileMsg =
          e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
        console.error('[storefront-hero] outline turnstile', turnstileMsg);
        setStatus('error');
        setError('Verification failed — please try again.');
        return;
      }
    }

    try {
      const profile = buildOutlineProfile(draftRef.current);
      const {
        ok,
        status: httpStatus,
        data,
      } = await fetchOutline(
        { profile, ...(turnstileToken ? { turnstileToken } : {}) },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;

      if (ok && data?.ok && isValidOutline(data.preview)) {
        if (outlineFingerprint(draftRef.current) !== fpAtStart) {
          actedOnFpRef.current = null;
          setStatus('idle');
          bumpOutlineEpoch();
          return;
        }
        updateDraft({
          fitnessAiPreview: data.preview,
          fitnessAiPreviewFingerprint: fpAtStart,
        });
        setStatus('ready');
        return;
      }

      if (httpStatus === 403) {
        resetTurnstile();
        const errMsg = typeof data?.error === 'string' ? data.error : '';
        console.error('[storefront-hero] outline 403', httpStatus, errMsg || 'forbidden');
        setStatus('error');
        setError('Verification failed — please try again.');
        return;
      }

      if (!ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : '';
        console.error(
          '[storefront-hero] outline http error',
          httpStatus,
          errMsg || 'request failed',
        );
        setStatus('error');
        setError("We couldn't generate your preview — please try again.");
        return;
      }

      const errMsg = typeof data?.error === 'string' ? data.error : '';
      console.error('[storefront-hero] outline malformed response', errMsg || 'invalid shape');
      setStatus('error');
      setError("We couldn't generate your preview — please try again.");
    } catch (e) {
      if (e?.name === 'AbortError') return;
      const errMsg = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
      console.error('[storefront-hero] outline fetch error', errMsg);
      setStatus('error');
      setError("We couldn't generate your preview — please try again.");
    }
  }, [updateDraft, bumpOutlineEpoch]);

  // Phase entry / fingerprint change: fetch or serve from cache, exactly once per fp.
  useEffect(() => {
    if (!enabled) {
      actedOnFpRef.current = null;
      return;
    }
    if (!currentFp) return;
    if (actedOnFpRef.current === currentFp) return;
    actedOnFpRef.current = currentFp;
    if (cacheHit) {
      setStatus('ready');
      setError(null);
      return;
    }
    void run();
  }, [enabled, currentFp, cacheHit, run, outlineEpoch]);

  // Abort any in-flight request on unmount.
  useEffect(
    () => () => {
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {
          // ignore
        }
      }
    },
    [],
  );

  const regenerate = useCallback(() => {
    void run();
  }, [run]);

  return { status, error, preview: cachedValidPreview, regenerate };
}
