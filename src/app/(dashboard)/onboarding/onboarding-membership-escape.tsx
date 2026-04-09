'use client';

import { useEffect, useRef } from 'react';
import { redirectIfHasWorkspaceMembership } from './actions';

/**
 * Rechecks workspace membership on the client so users are not stranded on `/onboarding` after
 * implicit-flow hash sign-in or other races where the server render missed fresh cookies.
 */
export function OnboardingMembershipEscape() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void redirectIfHasWorkspaceMembership();
  }, []);

  return null;
}
