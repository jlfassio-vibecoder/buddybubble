'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { WorkspaceCategory } from '@/types/database';

export type WorkspaceThemeContextValue = {
  /** DB `category_type` for the route workspace — product behavior only. */
  workspaceCategory: WorkspaceCategory | null;
  /** Palette category for ThemeScope / portals (may include user override). */
  themeCategory: WorkspaceCategory;
};

const WorkspaceThemeContext = createContext<WorkspaceThemeContextValue | null>(null);

export function WorkspaceThemeProvider({
  workspaceCategory,
  themeCategory,
  children,
}: WorkspaceThemeContextValue & { children: ReactNode }) {
  return (
    <WorkspaceThemeContext.Provider value={{ workspaceCategory, themeCategory }}>
      {children}
    </WorkspaceThemeContext.Provider>
  );
}

/** Returns null outside a workspace shell (storefront, invite, tests). */
export function useWorkspaceTheme(): WorkspaceThemeContextValue | null {
  return useContext(WorkspaceThemeContext);
}
