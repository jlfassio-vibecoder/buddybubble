'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { normalizeMobileTab, type MobileCrmTab } from '@/lib/mobile-crm-tab';

export type MobileShellState = {
  tab: MobileCrmTab;
  setTab: (tab: MobileCrmTab) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

const MobileShellStateContext = createContext<MobileShellState | null>(null);

/**
 * Owns mobile CRM tab (`?tab=`) and drawer open state for the dashboard shell.
 * Wrap `DashboardShellInner` (and any descendant that calls `useMobileShellState`, e.g. `MobileTabBar`).
 */
export function MobileShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = normalizeMobileTab(searchParams.get('tab'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const setTab = useCallback(
    (next: MobileCrmTab) => {
      const q = new URLSearchParams(searchParams.toString());
      q.set('tab', next);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const value = useMemo(
    () => ({ tab, setTab, drawerOpen, setDrawerOpen }),
    [tab, setTab, drawerOpen, setDrawerOpen],
  );

  return createElement(MobileShellStateContext.Provider, { value }, children);
}

/**
 * Mobile shell: active CRM tab from `?tab=` and drawer open state.
 * Tab writes go through `setTab` (router.replace, scroll: false).
 * Must be used under {@link MobileShellProvider}.
 */
export function useMobileShellState(): MobileShellState {
  const ctx = useContext(MobileShellStateContext);
  if (!ctx) {
    throw new Error('useMobileShellState must be used within a MobileShellProvider');
  }
  return ctx;
}
