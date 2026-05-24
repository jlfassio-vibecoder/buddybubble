'use client';

import { useMachine } from '@xstate/react';
import type { ActiveSessionInput } from '../machines/types';
import { activeSessionMachine } from '../machines/active-session.machine';

export function useActiveSession(input: ActiveSessionInput) {
  const [snapshot, send, actorRef] = useMachine(activeSessionMachine, {
    input,
  });

  return {
    snapshot,
    send,
    actorRef,
    context: snapshot.context,
  };
}
