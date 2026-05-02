'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { AmrapSessionEngine } from '@/features/amrap/types/amrap-engine';
import { cn } from '@/lib/utils';

/** Keep check visible briefly after server-backed round / lap row appears. */
const SUCCESS_HOLD_MS = 600;
const PENDING_ABORT_MS = 15000;

export default function AmrapLogRoundOverlay({ engine }: { engine: AmrapSessionEngine }) {
  const self = engine.selfParticipant;
  const [logUiPending, setLogUiPending] = useState(false);
  const [checkEntered, setCheckEntered] = useState(false);
  const pendingSyncRef = useRef(false);
  const logConfirmedRef = useRef(false);
  const roundsAtClickRef = useRef(0);
  const lapsAtClickRef = useRef(0);
  const errorSnapshotAtClickRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (!logUiPending) {
      setCheckEntered(false);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setCheckEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [logUiPending]);

  useEffect(() => {
    if (!logUiPending || logConfirmedRef.current) return;
    const rounds = self?.rounds ?? 0;
    const laps = engine.roundLapEntries.length;
    if (rounds > roundsAtClickRef.current || laps > lapsAtClickRef.current) {
      logConfirmedRef.current = true;
      const t = window.setTimeout(() => {
        pendingSyncRef.current = false;
        logConfirmedRef.current = false;
        setLogUiPending(false);
      }, SUCCESS_HOLD_MS);
      return () => clearTimeout(t);
    }
  }, [logUiPending, self?.rounds, engine.roundLapEntries.length]);

  useEffect(() => {
    if (!logUiPending) return;
    const snap = errorSnapshotAtClickRef.current;
    const err = engine.error;
    if (err != null && err !== snap) {
      pendingSyncRef.current = false;
      logConfirmedRef.current = false;
      setLogUiPending(false);
    }
  }, [logUiPending, engine.error]);

  useEffect(() => {
    if (!logUiPending) return;
    const id = window.setTimeout(() => {
      pendingSyncRef.current = false;
      logConfirmedRef.current = false;
      setLogUiPending(false);
    }, PENDING_ABORT_MS);
    return () => clearTimeout(id);
  }, [logUiPending]);

  if (!self) return null;

  const rounds = self.rounds;
  const canLog = engine.timerPhase === 'work' && engine.logRound != null;

  const handleLogRound = () => {
    if (!canLog || pendingSyncRef.current || !engine.logRound) return;
    logConfirmedRef.current = false;
    errorSnapshotAtClickRef.current = engine.error;
    roundsAtClickRef.current = self.rounds;
    lapsAtClickRef.current = engine.roundLapEntries.length;
    pendingSyncRef.current = true;
    setLogUiPending(true);
    void engine.logRound();
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[43]">
      <div className="pointer-events-auto absolute top-4 right-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-white shadow-lg backdrop-blur-md">
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
            Rounds
          </span>
          <span className="text-2xl font-bold tabular-nums">{rounds}</span>
        </div>
        {logUiPending ? (
          <div
            className="flex h-9 min-w-[5.75rem] items-center justify-center"
            aria-live="polite"
            aria-busy="true"
          >
            <Check
              className={cn(
                'size-7 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)] transition-all duration-300 ease-out motion-reduce:transition-none',
                checkEntered ? 'scale-100 opacity-100' : 'scale-[0.15] opacity-0',
              )}
              strokeWidth={2.75}
              aria-label="Round logged"
            />
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canLog}
            onClick={handleLogRound}
          >
            Log round
          </Button>
        )}
      </div>
    </div>
  );
}
