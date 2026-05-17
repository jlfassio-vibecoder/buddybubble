/**
 * Autoscroll policy for stacked chat UIs: scrollable transcript + fixed composer below.
 *
 * **Why this exists:** Debounced *smooth* `scrollTo` on the transcript is great when the user
 * is reading history, but on some engines (notably mobile WebKit) programmatic smooth scrolling
 * while the message composer is focused can interact badly with the IME / focus lifecycle and
 * effectively “kick” the caret out of the field.
 *
 * **Policy:**
 * - If focus is inside `composerShell` (composer form, attach control, etc.), scroll the
 *   transcript to the bottom using synchronous `scrollTop` after layout (`requestAnimationFrame`),
 *   then optionally restore the primary text field if focus left the shell unexpectedly.
 * - Otherwise, keep the debounced *smooth* scroll for visual polish.
 *
 * Call from a `useEffect` cleanup to cancel pending rAF / timeout when deps change or unmount.
 */
export type ScheduleScrollChatThreadToBottomArgs = {
  scrollRoot: HTMLElement | null;
  /** Wrapper around the composer (and optional footer chrome) used for focus detection. */
  composerShell: HTMLElement | null;
};

function findPrimaryComposerField(
  shell: HTMLElement,
): HTMLInputElement | HTMLTextAreaElement | null {
  const form = shell.querySelector('form');
  if (!form) return null;
  const ta = form.querySelector<HTMLTextAreaElement>('textarea:not([disabled])');
  if (ta) return ta;
  return form.querySelector<HTMLInputElement>('input[type="text"]:not([disabled])');
}

function restorePrimaryComposerFocusIfNeeded(
  composerShell: HTMLElement | null,
  schedule: (cb: FrameRequestCallback) => number,
): void {
  if (!composerShell) return;
  schedule(() => {
    if (composerShell.contains(document.activeElement)) return;
    const primary = findPrimaryComposerField(composerShell);
    if (!primary || primary.disabled) return;
    primary.focus();
    try {
      const len = primary.value.length;
      primary.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  });
}

/**
 * Schedules a transcript scroll to the latest content. Returns a disposer that cancels pending work.
 */
export function scheduleScrollChatThreadToBottom({
  scrollRoot,
  composerShell,
}: ScheduleScrollChatThreadToBottomArgs): () => void {
  if (!scrollRoot) return () => {};

  const focused = document.activeElement;
  const hadFocusInsideShell =
    focused instanceof HTMLElement && Boolean(composerShell?.contains(focused));

  if (hadFocusInsideShell) {
    const rafIds = new Set<number>();
    const schedule = (cb: FrameRequestCallback) => {
      const id = requestAnimationFrame(cb);
      rafIds.add(id);
      return id;
    };
    schedule(() => {
      schedule(() => {
        scrollRoot.scrollTop = scrollRoot.scrollHeight;
        schedule(() => {
          scrollRoot.scrollTop = scrollRoot.scrollHeight;
          restorePrimaryComposerFocusIfNeeded(composerShell, schedule);
        });
      });
    });
    return () => {
      for (const id of rafIds) cancelAnimationFrame(id);
    };
  }

  const id = window.setTimeout(() => {
    scrollRoot.scrollTo({
      top: scrollRoot.scrollHeight,
      behavior: 'smooth',
    });
  }, 50);
  return () => window.clearTimeout(id);
}
