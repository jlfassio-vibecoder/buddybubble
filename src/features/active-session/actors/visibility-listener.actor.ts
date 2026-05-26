import { fromCallback } from 'xstate';

/** Document visibility — sends VISIBILITY to the invoking active session machine. */
export const visibilityListenerActor = fromCallback(({ sendBack }) => {
  if (typeof document === 'undefined') return () => {};

  const emit = () => sendBack({ type: 'VISIBILITY', hidden: document.hidden });
  document.addEventListener('visibilitychange', emit);
  emit();

  return () => document.removeEventListener('visibilitychange', emit);
});
