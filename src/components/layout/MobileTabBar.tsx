'use client';

import { CalendarDays, LayoutGrid, MessageSquare, PanelLeft } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { normalizeMobileTab, type MobileCrmTab } from '@/lib/mobile-crm-tab';

type Props = {
  onOpenNavigation: () => void;
};

const ITEMS: { id: MobileCrmTab; label: string; Icon: typeof MessageSquare }[] = [
  { id: 'chat', label: 'Chat', Icon: MessageSquare },
  { id: 'board', label: 'Board', Icon: LayoutGrid },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
];

export function MobileTabBar({ onOpenNavigation }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = normalizeMobileTab(searchParams.get('tab'));

  function setTab(tab: MobileCrmTab) {
    const q = new URLSearchParams(searchParams.toString());
    q.set('tab', tab);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[90] flex h-[calc(4rem+env(safe-area-inset-bottom,0px))] items-stretch border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      aria-label="Primary socialspace views"
    >
      <button
        type="button"
        onClick={onOpenNavigation}
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <PanelLeft className="size-5" aria-hidden />
        <span className="truncate">Menu</span>
      </button>
      {ITEMS.map(({ id, label, Icon }) => {
        const isOn = active === id;
        return (
          <button
            key={id}
            type="button"
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
