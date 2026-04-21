'use client';

import { Fragment } from 'react';
import { Button } from '@/components/ui/button';

export type AmrapVideoOverlaysProps = {
  isHost?: boolean;
};

/**
 * Theater-mode overlays for AMRAP-style live workouts: timer (top-left) and round logger (top-right).
 * Render inside {@link BaseVideoHarness} `videoOverlays`; parent supplies `pointer-events-none` shell—panels use `pointer-events-auto`.
 */
export function AmrapVideoOverlays({ isHost = false }: AmrapVideoOverlaysProps) {
  return (
    <Fragment>
      {/* Timer — top-left */}
      <div className="pointer-events-auto absolute top-4 left-4 max-w-[min(100vw-2rem,20rem)] rounded-xl border border-white/10 bg-black/50 p-4 text-white shadow-lg backdrop-blur-md">
        {isHost ? (
          <div className="mb-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-white hover:bg-white/10"
            >
              Pause
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-white/25 text-white hover:bg-white/10"
            >
              Finish
            </Button>
          </div>
        ) : null}
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
          Time remaining
        </p>
        <p className="mt-1 font-bold tabular-nums text-5xl leading-none tracking-tight">14:55</p>
      </div>

      {/* Round logger — top-right */}
      <div className="pointer-events-auto absolute top-4 right-4 flex max-w-[min(100vw-2rem,18rem)] flex-col gap-4 rounded-xl border border-white/10 bg-black/50 p-4 text-white shadow-lg backdrop-blur-md">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
            Your rounds
          </p>
          <p className="mt-2 font-bold tabular-nums text-5xl leading-none tracking-tight">0</p>
        </div>
        <Button type="button" size="lg" className="w-full font-semibold">
          Log round
        </Button>
      </div>
    </Fragment>
  );
}
