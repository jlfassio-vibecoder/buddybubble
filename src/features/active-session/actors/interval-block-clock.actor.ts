import { fromCallback } from 'xstate';

/** rAF loop — sends CLOCK_FRAME to the invoking interval block machine. */
export const intervalBlockClockActor = fromCallback(({ sendBack }) => {
  let frame = 0;

  const loop = () => {
    frame = requestAnimationFrame(loop);
    sendBack({ type: 'CLOCK_FRAME', now: Date.now() });
  };

  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
  };
});
