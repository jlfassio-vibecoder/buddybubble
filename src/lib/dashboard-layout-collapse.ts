import { normalizeMobileTab } from '@/lib/mobile-crm-tab';

export type StoredCollapsePrefs = {
  chatRaw: string | null;
  kanbanRaw: string | null;
  calendarRaw: string | null;
};

export type ResolveDashboardLayoutCollapseInput = {
  embedMode: boolean;
  urlTab: string | null;
  urlView: string | null;
  isNarrow: boolean;
  stored: StoredCollapsePrefs;
};

export type ResolvedDashboardLayoutCollapse = {
  chatCollapsed: boolean;
  kanbanCollapsed: boolean;
  calendarCollapsed: boolean;
  /** When true, caller should persist messages-focus collapse keys (desktop deep link). */
  persistMessagesFocusToStorage: boolean;
};

function isUrlChatOverride(urlTab: string | null, urlView: string | null): boolean {
  return urlTab === 'chat' || urlView?.toLowerCase() === 'messages';
}

function calendarCollapsedFromStored(stored: StoredCollapsePrefs): boolean {
  return stored.calendarRaw === '1';
}

function resolveMobileCollapseTriplet(
  urlTab: string | null,
  _urlView: string | null,
  stored: StoredCollapsePrefs,
): Pick<
  ResolvedDashboardLayoutCollapse,
  'chatCollapsed' | 'kanbanCollapsed' | 'calendarCollapsed'
> {
  const tab = normalizeMobileTab(urlTab);

  if (tab === 'board') {
    return {
      chatCollapsed: true,
      kanbanCollapsed: false,
      calendarCollapsed: calendarCollapsedFromStored(stored),
    };
  }
  if (tab === 'calendar') {
    return { chatCollapsed: true, kanbanCollapsed: true, calendarCollapsed: false };
  }

  return { chatCollapsed: false, kanbanCollapsed: true, calendarCollapsed: false };
}

function resolveDesktopCollapseTriplet(
  urlTab: string | null,
  urlView: string | null,
  stored: StoredCollapsePrefs,
): ResolvedDashboardLayoutCollapse {
  const urlChatOverride = isUrlChatOverride(urlTab, urlView);
  const isFreshLayoutPrefs =
    stored.chatRaw === null && stored.kanbanRaw === null && stored.calendarRaw === null;

  if (urlChatOverride) {
    return {
      chatCollapsed: false,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: true,
    };
  }

  if (isFreshLayoutPrefs) {
    return {
      chatCollapsed: false,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    };
  }

  let kanbanCollapsed = stored.kanbanRaw === '1';
  let chatCollapsed = stored.chatRaw === '1';
  if (chatCollapsed && kanbanCollapsed) kanbanCollapsed = false;

  let calendarCollapsed = stored.calendarRaw === '1';
  if (kanbanCollapsed && calendarCollapsed) calendarCollapsed = false;

  return {
    chatCollapsed,
    kanbanCollapsed,
    calendarCollapsed,
    persistMessagesFocusToStorage: false,
  };
}

/**
 * Single source for chat/kanban/calendar collapse on dashboard hydrate.
 * On narrow viewports, `?tab=` wins over localStorage (mobile CRM tabs).
 */
export function resolveDashboardLayoutCollapse(
  input: ResolveDashboardLayoutCollapseInput,
): ResolvedDashboardLayoutCollapse {
  const { embedMode, urlTab, urlView, isNarrow, stored } = input;

  if (isNarrow && !embedMode) {
    const triplet = resolveMobileCollapseTriplet(urlTab, urlView, stored);
    return { ...triplet, persistMessagesFocusToStorage: false };
  }

  return resolveDesktopCollapseTriplet(urlTab, urlView, stored);
}
