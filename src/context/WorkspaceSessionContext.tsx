'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export type WorkspaceSessionContextValue = {
  /** Member context for chat/tasks: defaults to signed-in user; owner/admin on a private bubble may be the selected member. */
  subjectUserId: string | null;
};

const WorkspaceSessionContext = createContext<WorkspaceSessionContextValue>({
  subjectUserId: null,
});

export function WorkspaceSessionProvider({
  subjectUserId,
  children,
}: {
  subjectUserId: string | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ subjectUserId }), [subjectUserId]);
  return (
    <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSessionSubject(): WorkspaceSessionContextValue {
  return useContext(WorkspaceSessionContext);
}
