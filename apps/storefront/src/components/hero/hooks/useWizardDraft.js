import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { readPersisted, writePersisted } from '../lib/storageKey';

/** Same as `useHeroPhase`: hydrate in layout so passive persist never overwrites with initial `{}`. */
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Wizard-draft state persisted to sessionStorage.
 *
 * Shares the same key as `useHeroPhase` but only writes its own slice (`profileDraft`),
 * so sibling slices from other hooks are preserved.
 */
export function useWizardDraft(publicSlug) {
  const slug = (publicSlug || '').trim().toLowerCase();
  const [draft, setDraft] = useState({});
  const [hasHydrated, setHasHydrated] = useState(false);

  useIsoLayoutEffect(() => {
    if (!slug) {
      setHasHydrated(true);
      return;
    }
    const persisted = readPersisted(slug);
    if (
      persisted &&
      persisted.profileDraft &&
      typeof persisted.profileDraft === 'object' &&
      !Array.isArray(persisted.profileDraft)
    ) {
      setDraft(persisted.profileDraft);
    }
    setHasHydrated(true);
  }, [slug]);

  useEffect(() => {
    if (!hasHydrated || !slug) return;
    writePersisted(slug, { profileDraft: draft });
  }, [slug, draft, hasHydrated]);

  const updateDraft = useCallback((partial) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetDraft = useCallback(() => setDraft({}), []);

  return { draft, updateDraft, resetDraft };
}
