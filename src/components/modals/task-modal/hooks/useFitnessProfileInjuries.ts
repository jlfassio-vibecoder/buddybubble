'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import { readInjuriesOnFileFromBiometrics } from '@/lib/agents/coach/exercise-cue-request';

export function useFitnessProfileInjuries(
  open: boolean,
  workspaceId: string,
  enabled: boolean,
): boolean {
  const [injuriesOnFile, setInjuriesOnFile] = useState(false);

  useEffect(() => {
    if (!open || !enabled || !workspaceId) return;
    let cancelled = false;
    let supabase;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      void supabase
        .from('fitness_profiles')
        .select('biometrics')
        .eq('workspace_id', workspaceId)
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(({ data: fp }) => {
          if (cancelled) return;
          setInjuriesOnFile(readInjuriesOnFileFromBiometrics(fp?.biometrics).onFile);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, enabled, workspaceId]);

  return injuriesOnFile;
}
