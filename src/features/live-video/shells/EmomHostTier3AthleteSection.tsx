'use client';

import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { EmomSelfMinuteSplitsList } from '@/features/live-video/shells/EmomSelfMinuteSplitsList';
import { EmomSlapTarget } from '@/features/live-video/shells/EmomSlapTarget';
import { computeEmomSelfMinuteSplits } from '@/features/live-video/wrappers/interval/utils/computeEmomSelfMinuteSplits';
import { useLiveSessionRuntime } from '@/features/live-video/theater/live-session-runtime-context';
import { useEmomAthleteLogging } from '@/features/live-video/wrappers/interval/hooks/useEmomAthleteLogging';
import type { Database } from '@/types/database';
import { useUserProfileStore } from '@/store/userProfileStore';

export type EmomHostTier3AthleteSectionProps = {
  supabase: SupabaseClient<Database>;
};

/**
 * Host tier-3 EMOM athlete surface: same Slap Target as participants (not on video overlay).
 */
export function EmomHostTier3AthleteSection({ supabase }: EmomHostTier3AthleteSectionProps) {
  const { state, sessionId, isHost } = useLiveSessionRuntime();
  const userId = useUserProfileStore((s) => s.profile?.id ?? null);

  const emomLogging = useEmomAthleteLogging({
    supabase,
    sessionId,
    userId,
    phase: state.phase,
    isHost,
    activeDeckItemId: state.activeDeckItemId,
  });

  const selfSplits = useMemo(
    () =>
      computeEmomSelfMinuteSplits({
        logs: emomLogging.logs,
        blocks: emomLogging.blocks,
        formatParams: emomLogging.formatParams,
      }),
    [emomLogging.logs, emomLogging.blocks, emomLogging.formatParams],
  );

  if (state.phase !== 'emom' || !emomLogging.intervalSessionId || !emomLogging.ready) {
    return null;
  }

  const sessionPaused = state.status === 'paused';

  return (
    <div className="shrink-0 space-y-3 pb-4" data-region="emom-host-tier3-athlete">
      <EmomSlapTarget
        intervalSessionId={emomLogging.intervalSessionId}
        blocks={emomLogging.blocks}
        flatExerciseNames={emomLogging.flatExerciseNames}
        formatParams={emomLogging.formatParams}
        logSet={emomLogging.logSet}
        getExistingLog={emomLogging.getExistingLog}
        disabled={sessionPaused}
      />
      <EmomSelfMinuteSplitsList entries={selfSplits} />
    </div>
  );
}
