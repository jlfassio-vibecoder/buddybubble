import { useCallback, useEffect, useRef, useState } from 'react';
import { readPersisted, writePersisted } from '../lib/storageKey';

/**
 * Wizard-draft state persisted to sessionStorage.
 *
 * Shares the same key as `useHeroPhase` but only writes its own slice (`profileDraft`),
 * so sibling slices from other hooks are preserved.
 */
export function useWizardDraft(publicSlug) {
  const slug = (publicSlug || '').trim().toLowerCase();
  const [draft, setDraft] = useState({});
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = true;
    if (!slug) return;
    const persisted = readPersisted(slug);
    if (
      persisted &&
      persisted.profileDraft &&
      typeof persisted.profileDraft === 'object' &&
      !Array.isArray(persisted.profileDraft)
    ) {
      setDraft(persisted.profileDraft);
    }
  }, [slug]);

  useEffect(() => {
    if (!hydratedRef.current || !slug) return;
    writePersisted(slug, { profileDraft: draft });
  }, [slug, draft]);

  const updateDraft = useCallback((partial) => {
    setDraft((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetDraft = useCallback(() => setDraft({}), []);

  return { draft, updateDraft, resetDraft };
}
