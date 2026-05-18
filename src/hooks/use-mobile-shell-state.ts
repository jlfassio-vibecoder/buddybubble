'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { normalizeMobileNav, normalizeMobileTab, type MobileCrmTab } from '@/lib/mobile-crm-tab';

export type MobileShellState = {
  tab: MobileCrmTab;
  setTab: (tab: MobileCrmTab) => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
};

const MobileShellStateContext = createContext<MobileShellState | null>(null);

function hrefFor(pathname: string, q: URLSearchParams): string {
  const qs = q.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Owns mobile CRM tab (`?tab=`) and menu drawer (`?nav=open`) for the dashboard shell.
 * Drawer/tab URL updates use `router.replace` (no extra history entries; system Back does not close the drawer).
 */
export function MobileShellProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const tab = normalizeMobileTab(searchParams.get('tab'));
  const drawerOpen = normalizeMobileNav(searchParams.get('nav'));

  const replaceSearchIfChanged = useCallback(
    (mutate: (q: URLSearchParams) => void) => {
      const q = new URLSearchParams(searchKey);
      mutate(q);
      const nextHref = hrefFor(pathname, q);
      const currentHref = hrefFor(pathname, new URLSearchParams(searchKey));
      if (nextHref === currentHref) return;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchKey],
  );

  const setTab = useCallback(
    (next: MobileCrmTab) => {
      const q = new URLSearchParams(searchKey);
      if (normalizeMobileTab(q.get('tab')) === next) return;
      replaceSearchIfChanged((draft) => {
        draft.set('tab', next);
      });
    },
    [replaceSearchIfChanged, searchKey],
  );

  const setDrawerOpen = useCallback(
    (open: boolean) => {
      const q = new URLSearchParams(searchKey);
      if (normalizeMobileNav(q.get('nav')) === open) return;
      replaceSearchIfChanged((draft) => {
        if (open) draft.set('nav', 'open');
        else draft.delete('nav');
      });
    },
    [replaceSearchIfChanged, searchKey],
  );

  const value = useMemo(
    () => ({ tab, setTab, drawerOpen, setDrawerOpen }),
    [tab, setTab, drawerOpen, setDrawerOpen],
  );

  return createElement(MobileShellStateContext.Provider, { value }, children);
}

/**
 * Mobile shell: active CRM tab from `?tab=` and drawer from `?nav=open`.
 * Must be used under {@link MobileShellProvider}.
 */
export function useMobileShellState(): MobileShellState {
  const ctx = useContext(MobileShellStateContext);
  if (!ctx) {
    throw new Error('useMobileShellState must be used within a MobileShellProvider');
  }
  return ctx;
}
