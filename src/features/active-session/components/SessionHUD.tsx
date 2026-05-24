'use client';

import { Check } from 'lucide-react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { Button } from '@/components/ui/button';
import { activeSessionMachine } from '../machines/active-session.machine';

type ActiveSessionActorRef = ActorRefFrom<typeof activeSessionMachine>;

type Props = {
  title: string;
  actorRef: ActiveSessionActorRef;
  abandonDisabled: boolean;
  finishBusy: boolean;
  onAbandon: () => void;
  onFinish: () => void;
  finishDisabled?: boolean;
};

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function SessionHUD({
  title,
  actorRef,
  abandonDisabled,
  finishBusy,
  onAbandon,
  onFinish,
  finishDisabled = false,
}: Props) {
  const elapsedSec = useSelector(actorRef, (snapshot) => snapshot.context.elapsedSec);

  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">Active Session</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Elapsed
          </span>
          <span
            className="font-mono text-lg tabular-nums text-foreground"
            aria-live="polite"
            data-testid="session-hud-elapsed"
          >
            {formatElapsed(elapsedSec)}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onAbandon} disabled={abandonDisabled}>
          Back
        </Button>
        <Button
          size="sm"
          onClick={onFinish}
          disabled={finishDisabled || finishBusy}
          className="gap-1.5"
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {finishBusy ? 'Saving…' : 'Finish'}
        </Button>
      </div>
    </header>
  );
}
