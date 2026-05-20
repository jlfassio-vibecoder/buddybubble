import { describe, expect, it } from 'vitest';
import { resolveDashboardLayoutCollapse } from '@/lib/dashboard-layout-collapse';

const fresh = { chatRaw: null, kanbanRaw: null, calendarRaw: null };
const desktopMessagesFocus = { chatRaw: '0', kanbanRaw: '1', calendarRaw: '0' };

describe('resolveDashboardLayoutCollapse', () => {
  it('narrow + urlTab=board + fresh LS → board triplet', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: 'board',
        urlView: null,
        isNarrow: true,
        stored: fresh,
      }),
    ).toEqual({
      chatCollapsed: true,
      kanbanCollapsed: false,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });

  it('narrow + urlTab=board + desktop messages-focus LS → URL wins', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: 'board',
        urlView: null,
        isNarrow: true,
        stored: desktopMessagesFocus,
      }),
    ).toEqual({
      chatCollapsed: true,
      kanbanCollapsed: false,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });

  it('narrow + default chat tab + fresh LS → chat triplet', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: null,
        urlView: null,
        isNarrow: true,
        stored: fresh,
      }),
    ).toEqual({
      chatCollapsed: false,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });

  it('narrow + calendar tab → calendar triplet', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: 'calendar',
        urlView: null,
        isNarrow: true,
        stored: fresh,
      }),
    ).toEqual({
      chatCollapsed: true,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });

  it('narrow + view=messages without board/calendar tab → chat triplet', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: 'chat',
        urlView: 'messages',
        isNarrow: true,
        stored: fresh,
      }),
    ).toEqual({
      chatCollapsed: false,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });

  it('narrow + tab=board + view=messages (default login URL) → board triplet', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: 'board',
        urlView: 'messages',
        isNarrow: true,
        stored: fresh,
      }),
    ).toEqual({
      chatCollapsed: true,
      kanbanCollapsed: false,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });

  it('wide + fresh LS → desktop chat focus default', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: null,
        urlView: null,
        isNarrow: false,
        stored: fresh,
      }),
    ).toEqual({
      chatCollapsed: false,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });

  it('wide + urlChatOverride → messages focus + persist flag', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: 'chat',
        urlView: null,
        isNarrow: false,
        stored: { chatRaw: '1', kanbanRaw: '0', calendarRaw: '1' },
      }),
    ).toEqual({
      chatCollapsed: false,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: true,
    });
  });

  it('wide + LS parse enforces chat+kanban invariant and k+cal guard', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: 'board',
        urlView: null,
        isNarrow: false,
        stored: { chatRaw: '1', kanbanRaw: '1', calendarRaw: '1' },
      }),
    ).toEqual({
      chatCollapsed: true,
      kanbanCollapsed: false,
      calendarCollapsed: true,
      persistMessagesFocusToStorage: false,
    });
  });

  it('wide + k and cal both collapsed opens calendar when kanban hidden', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: false,
        urlTab: null,
        urlView: null,
        isNarrow: false,
        stored: { chatRaw: '0', kanbanRaw: '1', calendarRaw: '1' },
      }),
    ).toEqual({
      chatCollapsed: false,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });

  it('narrow + embedMode uses desktop path', () => {
    expect(
      resolveDashboardLayoutCollapse({
        embedMode: true,
        urlTab: 'board',
        urlView: null,
        isNarrow: true,
        stored: fresh,
      }),
    ).toEqual({
      chatCollapsed: false,
      kanbanCollapsed: true,
      calendarCollapsed: false,
      persistMessagesFocusToStorage: false,
    });
  });
});
