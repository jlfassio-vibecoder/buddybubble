'use client';

import { type ReactNode } from 'react';
import { Clock, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Client-side stats for v1; extend for Analytics Epic (AMRAP rounds, EMOM %, sets/reps, etc.). */
export interface SessionStats {
  durationMs?: number;
  participantCount?: number;
}

export interface PostSessionSummaryProps {
  stats: SessionStats;
  isHost?: boolean;
  onReturnToDashboard: () => void;
  className?: string;
}

function formatDurationMmSs(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '--:--';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function StatCard({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-3 py-3',
        'min-h-[4.5rem]',
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon ? <span className="text-foreground/80">{icon}</span> : null}
        {label}
      </div>
      <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export function PostSessionSummary({
  stats,
  isHost = false,
  onReturnToDashboard,
  className,
}: PostSessionSummaryProps) {
  const title = isHost ? 'Workout complete!' : 'The host has ended the session.';
  const durationLabel = formatDurationMmSs(stats.durationMs);
  const participantsLabel =
    stats.participantCount != null && Number.isFinite(stats.participantCount)
      ? String(stats.participantCount)
      : '--';

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-4',
        className,
      )}
    >
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Duration"
              value={durationLabel}
              icon={<Clock className="size-3.5" />}
            />
            <StatCard
              label="Participants"
              value={participantsLabel}
              icon={<Users className="size-3.5" />}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border pt-4">
          <Button
            type="button"
            size="lg"
            className="min-w-[12rem] font-semibold"
            onClick={onReturnToDashboard}
          >
            Return to dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
