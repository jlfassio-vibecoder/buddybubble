'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { UnitSystem } from '@/types/database';

export function useWorkoutUnitSystem(
  open: boolean,
  workspaceId: string,
  isWorkoutItemType: boolean,
): { workoutUnitSystem: UnitSystem; setWorkoutUnitSystem: (v: UnitSystem) => void } {
  const [workoutUnitSystem, setWorkoutUnitSystem] = useState<UnitSystem>('metric');

  useEffect(() => {
    if (!open || !isWorkoutItemType) return;
    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      void supabase
        .from('fitness_profiles')
        .select('unit_system')
        .eq('workspace_id', workspaceId)
        .eq('user_id', data.user.id)
        .maybeSingle()
        .then(({ data: fp }) => {
          if (cancelled) return;
          setWorkoutUnitSystem((fp?.unit_system as UnitSystem | null) ?? 'metric');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [open, isWorkoutItemType, workspaceId]);

  return { workoutUnitSystem, setWorkoutUnitSystem };
}
