export type MobileCrmTab = 'chat' | 'board' | 'calendar';

export function normalizeMobileTab(value: string | null): MobileCrmTab {
  if (value === 'board' || value === 'calendar') return value;
  return 'chat';
}

/** Mobile menu drawer open when `?nav=open` (synced via `router.replace`, same history semantics as `?tab=`). */
export function normalizeMobileNav(value: string | null): boolean {
  return value === 'open';
}
