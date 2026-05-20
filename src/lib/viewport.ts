/**
 * Canonical viewport breakpoints.
 *
 * Single source of truth for the "below Tailwind `md`" breakpoint
 * used by both `useIsNarrowBelowMd` and any ad-hoc `window.matchMedia`
 * call sites. Keep in sync with Tailwind's `md` (768px) — the `767.98px`
 * cap matches the `(max-width: ...)` convention used by Bootstrap-style
 * responsive utilities and avoids the 1px overlap at exactly 768px.
 */
export const NARROW_MAX_QUERY = '(max-width: 767.98px)';

/** Synchronous narrow check for layout hydrate (avoids one-frame `useState(false)` before `useLayoutEffect`). */
export function readIsNarrowBelowMd(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(NARROW_MAX_QUERY).matches;
}
