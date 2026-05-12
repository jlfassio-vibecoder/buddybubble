import type { RealtimeChannel } from '@supabase/supabase-js';

type BroadcastBinding = {
  ref: number;
  filter: { event?: string };
  callback: (message: { payload: unknown }) => void;
};

type RealtimeChannelInternals = RealtimeChannel & {
  bindings?: Record<string, BroadcastBinding[]>;
  channelAdapter?: { off: (event: string, ref?: number) => void };
  _updateFilterMessage?: () => void;
};

/**
 * Removes a single `broadcast` listener from a shared Supabase Realtime channel.
 * `RealtimeChannel` does not expose a public `.off()`; this uses the same internal
 * `bindings` + Phoenix `ref` shape that `_on()` registers.
 */
export function removeRealtimeBroadcastListener(
  channel: RealtimeChannel,
  event: string,
  handler: (message: { payload: unknown }) => void,
): void {
  // Copilot suggestion ignored: Shared room-session channel has no public broadcast .off; internals match how supabase-js registers _on() bindings.
  const ch = channel as unknown as RealtimeChannelInternals;
  const list = ch.bindings?.broadcast;
  if (!list?.length) return;

  const idx = list.findIndex(
    (b) =>
      b.callback === handler &&
      (b.filter?.event === event || b.filter?.event?.toLowerCase() === event.toLowerCase()),
  );
  if (idx === -1) return;

  const { ref } = list[idx];
  ch.channelAdapter?.off('broadcast', ref);
  list.splice(idx, 1);
  if (list.length === 0 && ch.bindings) {
    delete ch.bindings.broadcast;
  }
  ch._updateFilterMessage?.();
}
