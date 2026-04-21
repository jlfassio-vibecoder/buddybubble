'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { TaskRow } from '@/types/database';
import {
  acceptSnapshotBaseline,
  cloneJsonMetadata,
  createSessionDeckSnapshot,
  withSnapshotTask,
} from '@/features/live-video/shells/huddle/session-deck-snapshot';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';

export type WorkoutDeckSelectionContextValue = {
  deck: SessionDeckSnapshot[];
  isSelectingFromBoard: boolean;
  activeSnapshotId: string | null;
  setActiveSnapshotId: (id: string | null) => void;
  addTaskToDeck: (task: TaskRow) => void;
  /** Replace deck order (e.g. after horizontal drag). Supports functional updates to avoid stale closures. */
  setDeckOrder: (next: SetStateAction<SessionDeckSnapshot[]>) => void;
  updateSnapshotTask: (snapshotId: string, task: TaskRow) => void;
  removeSnapshot: (snapshotId: string) => void;
  acceptSnapshotSessionOnly: (snapshotId: string) => void;
  /** After “Save as new”, point persistence at the new `tasks.id` and clear dirty. */
  rebindSnapshotOrigin: (snapshotId: string, newOriginTaskId: string) => void;
  enterSelectionMode: () => void;
  exitSelectionMode: () => void;
};

const WorkoutDeckSelectionContext = createContext<WorkoutDeckSelectionContextValue | null>(null);

export function WorkoutDeckSelectionProvider({ children }: { children: ReactNode }) {
  const [deck, setDeck] = useState<SessionDeckSnapshot[]>([]);
  const [isSelectingFromBoard, setIsSelectingFromBoard] = useState(false);
  const [activeSnapshotId, setActiveSnapshotIdState] = useState<string | null>(null);

  const setActiveSnapshotId = useCallback((id: string | null) => {
    setActiveSnapshotIdState(id);
  }, []);

  const addTaskToDeck = useCallback((task: TaskRow) => {
    const newSnapshot = createSessionDeckSnapshot(task);
    setActiveSnapshotIdState(newSnapshot.snapshotId);
    setDeck((prevDeck) => {
      return [...prevDeck, newSnapshot];
    });
  }, []);

  const setDeckOrder = useCallback((next: SetStateAction<SessionDeckSnapshot[]>) => {
    setDeck(next);
  }, []);

  const updateSnapshotTask = useCallback((snapshotId: string, task: TaskRow) => {
    setDeck((prev) =>
      prev.map((s) => (s.snapshotId === snapshotId ? withSnapshotTask(s, task) : s)),
    );
  }, []);

  const removeSnapshot = useCallback((snapshotId: string) => {
    setDeck((prev) => {
      if (!prev.some((s) => s.snapshotId === snapshotId)) return prev;
      const next = prev.filter((s) => s.snapshotId !== snapshotId);
      setActiveSnapshotIdState((cur) => (cur === snapshotId ? (next[0]?.snapshotId ?? null) : cur));
      return next;
    });
  }, []);

  const acceptSnapshotSessionOnly = useCallback((snapshotId: string) => {
    setDeck((prev) =>
      prev.map((s) => (s.snapshotId === snapshotId ? acceptSnapshotBaseline(s) : s)),
    );
  }, []);

  const rebindSnapshotOrigin = useCallback((snapshotId: string, newOriginTaskId: string) => {
    setDeck((prev) =>
      prev.map((s) => {
        if (s.snapshotId !== snapshotId) return s;
        return {
          ...s,
          originTaskId: newOriginTaskId,
          baselineMetadata: cloneJsonMetadata(s.task.metadata),
          dirty: false,
        };
      }),
    );
  }, []);

  const enterSelectionMode = useCallback(() => {
    setIsSelectingFromBoard(true);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectingFromBoard(false);
  }, []);
  // Copilot suggestion ignored: we are not deduping deck snapshots here because the current UX allows adding duplicates intentionally.

  const value = useMemo(
    (): WorkoutDeckSelectionContextValue => ({
      deck,
      isSelectingFromBoard,
      activeSnapshotId,
      setActiveSnapshotId,
      addTaskToDeck,
      setDeckOrder,
      updateSnapshotTask,
      removeSnapshot,
      acceptSnapshotSessionOnly,
      rebindSnapshotOrigin,
      enterSelectionMode,
      exitSelectionMode,
    }),
    [
      deck,
      isSelectingFromBoard,
      activeSnapshotId,
      setActiveSnapshotId,
      addTaskToDeck,
      setDeckOrder,
      updateSnapshotTask,
      removeSnapshot,
      acceptSnapshotSessionOnly,
      rebindSnapshotOrigin,
      enterSelectionMode,
      exitSelectionMode,
    ],
  );

  return (
    <WorkoutDeckSelectionContext.Provider value={value}>
      {children}
    </WorkoutDeckSelectionContext.Provider>
  );
}

/** Returns null when used outside `WorkoutDeckSelectionProvider` (e.g. scaffold routes). */
export function useWorkoutDeckSelectionOptional(): WorkoutDeckSelectionContextValue | null {
  return useContext(WorkoutDeckSelectionContext);
}

export function useWorkoutDeckSelection(): WorkoutDeckSelectionContextValue {
  const v = useContext(WorkoutDeckSelectionContext);
  if (!v) {
    throw new Error('useWorkoutDeckSelection requires WorkoutDeckSelectionProvider');
  }
  return v;
}

export type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';
