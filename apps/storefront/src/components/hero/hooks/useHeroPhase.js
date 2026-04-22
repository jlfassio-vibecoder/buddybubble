import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizePhase, readPersisted, writePersisted } from '../lib/storageKey';
import { canTransition } from '../lib/phaseTransitions';

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
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = true;
    if (!slug) return;
    const persisted = readPersisted(slug);
    if (persisted && typeof persisted.phase === 'string') {
      setPhaseState(normalizePhase(persisted.phase));
    }
  }, [slug]);

  useEffect(() => {
    if (!hydratedRef.current || !slug) return;
    writePersisted(slug, { phase });
  }, [slug, phase]);

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
