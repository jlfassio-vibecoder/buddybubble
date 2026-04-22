import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { normalizePhase, readPersisted, writePersisted } from '../lib/storageKey';
import { canTransition } from '../lib/phaseTransitions';

/** `useLayoutEffect` is a no-op on the server; hydrates before passive effects so persist never sees initial `idle` over restored phase. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Phase state machine persisted to sessionStorage.
 *
 * - Hydrates once on mount (SSR-safe: no sessionStorage access in the initializer).
 * - `setPhase(next)` is validated through `canTransition`; invalid transitions are no-ops.
 * - `forcePhase(next)` bypasses validation (used for error-recovery paths like
 *   `loading → idle` retry wiring from outside the allowed graph).
 */
export function useHeroPhase(publicSlug, categoryType) {
  const slug = (publicSlug || '').trim().toLowerCase();
  const [phase, setPhaseState] = useState('idle');
  const [hasHydrated, setHasHydrated] = useState(false);

  useIsoLayoutEffect(() => {
    if (!slug) {
      setHasHydrated(true);
      return;
    }
    const persisted = readPersisted(slug);
    if (persisted && typeof persisted.phase === 'string') {
      setPhaseState(normalizePhase(persisted.phase));
    }
    setHasHydrated(true);
  }, [slug]);

  useEffect(() => {
    if (!hasHydrated || !slug) return;
    writePersisted(slug, { phase });
  }, [slug, phase, hasHydrated]);

  const setPhase = useCallback(
    (next) => {
      setPhaseState((prev) => (canTransition(prev, next, categoryType) ? next : prev));
    },
    [categoryType],
  );

  const forcePhase = useCallback((next) => {
    setPhaseState(next);
  }, []);

  return { phase, setPhase, forcePhase };
}
