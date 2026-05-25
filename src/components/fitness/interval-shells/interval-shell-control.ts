import type { AnyActorRef } from 'xstate';

export type IntervalShellMachineControl = {
  intervalBlockRef: AnyActorRef;
  onStart: () => void | Promise<void>;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onLogRound?: () => void;
};
