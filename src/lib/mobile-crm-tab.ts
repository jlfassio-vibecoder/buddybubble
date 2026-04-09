export type MobileCrmTab = 'chat' | 'board' | 'calendar';

export function normalizeMobileTab(value: string | null): MobileCrmTab {
  if (value === 'board' || value === 'calendar') return value;
  return 'chat';
}
