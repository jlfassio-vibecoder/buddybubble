'use client';

import { CalendarDays, LayoutGrid, MessageSquare, PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMobileShellState } from '@/hooks/use-mobile-shell-state';
import type { MobileCrmTab } from '@/lib/mobile-crm-tab';

const ITEMS: { id: MobileCrmTab; label: string; Icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'board', label: 'Board', Icon: LayoutGrid },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
];

export function MobileTabBar() {
  const { tab: activeTab, setTab, setDrawerOpen } = useMobileShellState();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[90] flex h-[var(--mobile-tab-bar-h)] items-stretch border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      aria-label="Primary socialspace views"
    >
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <PanelLeft className="size-5" aria-hidden />
        <span className="truncate">Menu</span>
      </button>
      {ITEMS.map(({ id, label, Icon }) => {
        const isOn = activeTab === id;
        return (
          <button
            key={id}
            type="button"
            aria-current={isOn ? 'page' : undefined}
            onClick={() => setTab(id)}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors',
              isOn ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className={cn('size-5', isOn && 'stroke-[2.25px]')} aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
