import { useCallback, useEffect, useRef, useState } from 'react';
import { submitTrial } from '../lib/submitTrial';
import { getTurnstileToken, isTurnstileConfigured, resetTurnstile } from '../lib/turnstile';

const TAKING_LONGER_MS = 8000;
const RETRY_MS = 20000;

/**
 * Owns the phase-5 → phase-6 submit lifecycle:
 *   - Obtains a fresh Turnstile token (when configured).
 *   - POSTs to /api/storefront-trial (Astro proxy → CRM intake).
 *   - Exposes a `submitState` object that PhaseLoading renders purely.
 *   - Drives the 8s "taking longer" and 20s "retry" UI transitions.
 *
 * PhaseLoading must remain a pure function of `submitState` — no timers for
 * fetch lifecycle there, only the 400ms success beat.
 */
export function useSubmitState() {
  const [submitState, setSubmitState] = useState({ status: 'idle' });
  const timersRef = useRef({ takingLonger: null, retry: null });
  const abortRef = useRef(null);
  const payloadRef = useRef(null);
  const optionsRef = useRef(null);

  const clearTimers = useCallback(() => {
    if (timersRef.current.takingLonger) clearTimeout(timersRef.current.takingLonger);
    if (timersRef.current.retry) clearTimeout(timersRef.current.retry);
    timersRef.current.takingLonger = null;
    timersRef.current.retry = null;
  }, []);

  const armTimers = useCallback(() => {
    clearTimers();
    timersRef.current.takingLonger = setTimeout(() => {
      setSubmitState((prev) =>
        prev.status === 'pending' ? { ...prev, status: 'taking_longer' } : prev,
      );
    }, TAKING_LONGER_MS);
    timersRef.current.retry = setTimeout(() => {
      setSubmitState((prev) =>
        prev.status === 'pending' || prev.status === 'taking_longer'
          ? { status: 'error', error: 'This is taking too long. Please try again.' }
          : prev,
      );
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {
          // ignore
        }
        abortRef.current = null;
      }
    }, RETRY_MS);
  }, [clearTimers]);

  const runSubmit = useCallback(
    async (payload, options) => {
      clearTimers();
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {
          // ignore
        }
      }
      const controller = new AbortController();
      abortRef.current = controller;
      setSubmitState({ status: 'pending' });
      armTimers();

      let turnstileToken = null;
      if (isTurnstileConfigured()) {
        try {
          turnstileToken = await getTurnstileToken();
        } catch (e) {
          const errMsg =
            e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
          console.error('[storefront-hero] turnstile', errMsg);
          clearTimers();
          setSubmitState({ status: 'error', error: 'Verification failed — please try again.' });
          return;
        }
      }

      const body = { ...payload, ...(turnstileToken ? { turnstileToken } : {}) };
      try {
        const { ok, status, data } = await submitTrial(body, { signal: controller.signal });
        clearTimers();

        if (ok && typeof data?.next === 'string' && data.next) {
          setSubmitState({ status: 'success', next: data.next });
          return;
        }
        if (status === 409) {
          setSubmitState({
            status: 'already_member',
            workspaceId:
              typeof data?.workspaceId === 'string' && data.workspaceId
                ? data.workspaceId
                : options?.fallbackWorkspaceId || undefined,
          });
          return;
        }
        if (status === 400) {
          const errMsg = typeof data?.error === 'string' ? data.error : '';
          console.error(
            '[storefront-hero] intake 400 (payload issue)',
            status,
            errMsg || 'bad request',
          );
          setSubmitState({ status: 'error', error: 'Something went wrong — please try again.' });
          resetTurnstile();
          return;
        }
        if (status === 403) {
          setSubmitState({ status: 'error', error: 'Verification failed — please try again.' });
          resetTurnstile();
          return;
        }
        const fallback =
          typeof data?.error === 'string' && data.error
            ? data.error
            : 'Something went wrong — please try again.';
        setSubmitState({ status: 'error', error: fallback });
      } catch (e) {
        if (e?.name === 'AbortError') return;
        const errMsg = e instanceof Error ? e.message : typeof e === 'string' ? e : 'Unknown error';
        console.error('[storefront-hero] submit error', errMsg);
        clearTimers();
        setSubmitState({ status: 'error', error: 'Something went wrong — please try again.' });
      }
    },
    [armTimers, clearTimers],
  );

  const submit = useCallback(
    (payload, options = {}) => {
      payloadRef.current = payload;
      optionsRef.current = options;
      void runSubmit(payload, options);
    },
    [runSubmit],
  );

  const retry = useCallback(() => {
    if (!payloadRef.current) return;
    void runSubmit(payloadRef.current, optionsRef.current || {});
  }, [runSubmit]);

  const reset = useCallback(() => {
    clearTimers();
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        // ignore
      }
      abortRef.current = null;
    }
    payloadRef.current = null;
    optionsRef.current = null;
    setSubmitState({ status: 'idle' });
  }, [clearTimers]);

  useEffect(
    () => () => {
      clearTimers();
      if (abortRef.current) {
        try {
          abortRef.current.abort();
        } catch {
          // ignore
        }
      }
    },
    [clearTimers],
  );

  return { submitState, submit, retry, reset };
}
