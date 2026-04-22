import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StorefrontProfileDraft, WizardPhase } from './wizard-types';

const STORAGE_VERSION = 1;

function storageKey(publicSlug: string): string {
  return `buddybubble_storefront_trial_v1:${publicSlug.trim().toLowerCase()}`;
}

type PersistedWizardState = {
  version: number;
  storedSlug: string;
  phase: WizardPhase;
  profileDraft: StorefrontProfileDraft;
};

export type WizardState = {
  phase: WizardPhase;
  profileDraft: StorefrontProfileDraft;
};

export type WizardActions = {
  setPhase: (phase: WizardPhase) => void;
  updateProfile: (partial: Partial<StorefrontProfileDraft>) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
};

export function useWizardState(publicSlug: string): WizardState & WizardActions {
  const slug = useMemo(() => publicSlug.trim().toLowerCase(), [publicSlug]);

  // SSR-safe initializer: never touch sessionStorage here.
  const [state, setState] = useState<WizardState>(() => ({
    phase: 'idle',
    profileDraft: {},
  }));

  const [hasHydrated, setHasHydrated] = useState(false);

  // Hydrate from sessionStorage on the client after mount.
  useEffect(() => {
    if (!slug) {
      setHasHydrated(true);
      return;
    }
    try {
      const raw = sessionStorage.getItem(storageKey(slug));
      if (!raw) {
        setHasHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as PersistedWizardState;
      if (!parsed || typeof parsed !== 'object') {
        setHasHydrated(true);
        return;
      }
      if (parsed.version !== STORAGE_VERSION) {
        setHasHydrated(true);
        return;
      }
      if (parsed.storedSlug !== slug) {
        setHasHydrated(true);
        return;
      }

      const phase = ensurePhase(parsed.phase);
      const profileDraft =
        parsed.profileDraft &&
        typeof parsed.profileDraft === 'object' &&
        !Array.isArray(parsed.profileDraft)
          ? (parsed.profileDraft as StorefrontProfileDraft)
          : {};

      setState({ phase, profileDraft });
    } catch {
      // ignore (private mode, JSON errors)
    }
    setHasHydrated(true);
  }, [slug]);

  // Persist on every change after hydration.
  useEffect(() => {
    if (!hasHydrated) return;
    if (!slug) return;
    try {
      const payload: PersistedWizardState = {
        version: STORAGE_VERSION,
        storedSlug: slug,
        phase: state.phase,
        profileDraft: state.profileDraft,
      };
      sessionStorage.setItem(storageKey(slug), JSON.stringify(payload));
    } catch {
      // ignore quota / private mode
    }
  }, [slug, state.phase, state.profileDraft, hasHydrated]);

  const setPhase = useCallback((phase: WizardPhase) => {
    setState((prev) => ({ ...prev, phase }));
  }, []);

  const updateProfile = useCallback((partial: Partial<StorefrontProfileDraft>) => {
    setState((prev) => ({ ...prev, profileDraft: { ...prev.profileDraft, ...partial } }));
  }, []);

  const reset = useCallback(() => {
    setState({ phase: 'idle', profileDraft: {} });
    if (!slug) return;
    try {
      sessionStorage.removeItem(storageKey(slug));
    } catch {
      // ignore
    }
  }, [slug]);

  const next = useCallback(() => {
    setState((prev) => ({ ...prev, phase: nextPhase(prev.phase) }));
  }, []);

  const back = useCallback(() => {
    setState((prev) => ({ ...prev, phase: previousPhase(prev.phase) }));
  }, []);

  return {
    phase: state.phase,
    profileDraft: state.profileDraft,
    setPhase,
    updateProfile,
    next,
    back,
    reset,
  };
}

function ensurePhase(raw: unknown): WizardPhase {
  return raw === 'idle' ||
    raw === 'profile' ||
    raw === 'outline' ||
    raw === 'refine' ||
    raw === 'email' ||
    raw === 'loading'
    ? raw
    : 'idle';
}

function nextPhase(phase: WizardPhase): WizardPhase {
  switch (phase) {
    case 'idle':
      return 'profile';
    case 'profile':
      return 'outline';
    case 'outline':
      return 'refine';
    case 'refine':
      return 'email';
    case 'email':
      return 'loading';
    case 'loading':
    default:
      return 'loading';
  }
}

function previousPhase(phase: WizardPhase): WizardPhase {
  switch (phase) {
    case 'profile':
      return 'idle';
    case 'outline':
      return 'profile';
    case 'refine':
      return 'outline';
    case 'email':
      return 'refine';
    case 'loading':
      return 'email';
    case 'idle':
    default:
      return 'idle';
  }
}
