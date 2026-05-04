'use client';

import { createContext, useContext } from 'react';

export type LayoutCommands = {
  focusMessages: () => void;
  focusBoard: () => void;
  focusCalendar: () => void;
  focusSplit: () => void;
};

const unmountedLayoutCommands: LayoutCommands = {
  focusMessages: () => {
    throw new Error('useLayoutCommands must be used within LayoutCommandContext.Provider');
  },
  focusBoard: () => {
    throw new Error('useLayoutCommands must be used within LayoutCommandContext.Provider');
  },
  focusCalendar: () => {
    throw new Error('useLayoutCommands must be used within LayoutCommandContext.Provider');
  },
  focusSplit: () => {
    throw new Error('useLayoutCommands must be used within LayoutCommandContext.Provider');
  },
};

/** No-ops for trees outside `DashboardShell` (e.g. live-video scaffold) so hooks never throw. */
export const silentNoopLayoutCommands: LayoutCommands = {
  focusMessages: () => {},
  focusBoard: () => {},
  focusCalendar: () => {},
  focusSplit: () => {},
};

export const LayoutCommandContext = createContext<LayoutCommands>(unmountedLayoutCommands);

export function useLayoutCommands(): LayoutCommands {
  return useContext(LayoutCommandContext);
}
