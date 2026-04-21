'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { toast } from 'sonner';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';
import { formatUserFacingError } from '@/lib/format-error';
import type { LiveSessionDeckRow } from '@/features/live-video/hooks/useLiveSessionDeck';
import { useLiveVideoStore } from '@/store/liveVideoStore';
import { useUserProfileStore } from '@/store/userProfileStore';
import {
  acceptSnapshotBaseline,
  cloneJsonMetadata,
  createSessionDeckSnapshot,
  withSnapshotTask,
} from '@/features/live-video/shells/huddle/session-deck-snapshot';
import type { SessionDeckSnapshot } from '@/features/live-video/shells/huddle/session-deck-snapshot';

/** Survives React Strict Mode remounts so we do not wipe `deckItemId` / re-flush the same `session_id`. */
let moduleLastDeckAnchorSessionId: string | null = null;
/** Prevents duplicate DB flush for the same remote session after a successful flush. */
let moduleDeckFlushCompletedSessionId: string | null = null;

function logDeckWriteError(scope: string, err: unknown) {
  console.error(`[live_session_deck] ${scope}`, err);
  toast.error(formatUserFacingError(err));
}

function rehydrateSnapshotFromDeckRow(row: LiveSessionDeckRow): SessionDeckSnapshot | null {
  if (!row.tasks) return null;
  let clonedTask: TaskRow;
  try {
    clonedTask = structuredClone(row.tasks);
  } catch {
    clonedTask = JSON.parse(JSON.stringify(row.tasks)) as TaskRow;
  }
  clonedTask.id = row.id;
  return {
    deckRowKey: row.id,
    snapshotId: row.id,
    deckItemId: row.id,
    originTaskId: row.task_id,
    task: clonedTask,
    baselineMetadata: cloneJsonMetadata(clonedTask.metadata),
    dirty: false,
  };
}

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
  const supabase = useMemo(() => createClient(), []);
  const [deck, setDeck] = useState<SessionDeckSnapshot[]>([]);
  const [isSelectingFromBoard, setIsSelectingFromBoard] = useState(false);
  const [activeSnapshotId, setActiveSnapshotIdState] = useState<string | null>(null);

  const sessionId = useLiveVideoStore((s) => s.activeSession?.sessionId ?? null);
  const hostUserId = useLiveVideoStore((s) => s.activeSession?.hostUserId ?? null);
  const localUserId = useUserProfileStore((s) => s.profile?.id ?? null);

  const sidTrimmed = sessionId?.trim() ?? '';
  const canPersist = Boolean(sidTrimmed && localUserId && hostUserId && localUserId === hostUserId);

  const sessionIdRef = useRef<string | null>(null);
  const canPersistRef = useRef(false);
  const flushedSessionIdRef = useRef<string | null>(null);
  const hydratedSessionIdRef = useRef<string | null>(null);
  const deckRef = useRef<SessionDeckSnapshot[]>([]);
  /** SnapshotIds for which a host `insert` was issued; cleared only on insert error (Strict / double microtask guard). */
  const hostDeckInsertIssuedRef = useRef(new Set<string>());

  sessionIdRef.current = sidTrimmed || null;
  canPersistRef.current = canPersist;
  deckRef.current = deck;

  const setActiveSnapshotId = useCallback((id: string | null) => {
    setActiveSnapshotIdState(id);
  }, []);

  /**
   * When `session_id` changes (including leaving the session), clear row anchors synchronously
   * so the subsequent flush effect sees `deckItemId === null` for every snapshot.
   * Uses module-level `moduleLastDeckAnchorSessionId` so Strict Mode remount does not clear anchors again.
   */
  useLayoutEffect(() => {
    const sid = sidTrimmed || null;
    if (!sid) {
      moduleLastDeckAnchorSessionId = null;
      moduleDeckFlushCompletedSessionId = null;
      flushedSessionIdRef.current = null;
      hydratedSessionIdRef.current = null;
      setDeck((prev) => prev.map((s) => ({ ...s, deckItemId: null })));
      return;
    }
    if (moduleLastDeckAnchorSessionId === sid) {
      return;
    }
    moduleLastDeckAnchorSessionId = sid;
    moduleDeckFlushCompletedSessionId = null;
    flushedSessionIdRef.current = null;
    hydratedSessionIdRef.current = null;
    setDeck((prev) => prev.map((s) => ({ ...s, deckItemId: null })));
  }, [sidTrimmed]);

  /** Host revisit: repopulate the local deck from the persisted live session deck once per session. */
  useEffect(() => {
    if (!sidTrimmed) {
      hydratedSessionIdRef.current = null;
      return;
    }
    if (!canPersist) return;
    if (hydratedSessionIdRef.current === sidTrimmed) return;

    hydratedSessionIdRef.current = sidTrimmed;
    let cancelled = false;

    void (async () => {
      const { data, error } = await supabase
        .from('live_session_deck_items')
        .select('id, session_id, task_id, sort_order, created_at, updated_at, tasks(*)')
        .eq('session_id', sidTrimmed)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (cancelled) return;
      if (error) {
        hydratedSessionIdRef.current = null;
        logDeckWriteError('rehydrate', error);
        return;
      }

      const rehydratedDeck = ((data ?? []) as unknown as LiveSessionDeckRow[])
        .map(rehydrateSnapshotFromDeckRow)
        .filter((snap): snap is SessionDeckSnapshot => snap !== null);

      setDeck((prev) => {
        if (prev.length === 0) return rehydratedDeck;
        const existingRowKeys = new Set(prev.map((snap) => snap.deckRowKey));
        return [...prev, ...rehydratedDeck.filter((snap) => !existingRowKeys.has(snap.deckRowKey))];
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [sidTrimmed, canPersist, supabase]);

  /** Host: persist any in-memory deck rows once per session id (pre-session queue). */
  useEffect(() => {
    if (!sidTrimmed) {
      moduleDeckFlushCompletedSessionId = null;
      return;
    }
    if (!canPersist) return;

    if (moduleDeckFlushCompletedSessionId === sidTrimmed) {
      flushedSessionIdRef.current = sidTrimmed;
      return;
    }

    if (flushedSessionIdRef.current === sidTrimmed) return;
    flushedSessionIdRef.current = sidTrimmed;

    const sid = sidTrimmed;

    void (async () => {
      /** Rows already written this flush pass (React state may lag behind `deckRef`). */
      const flushWrittenSnapshotIds = new Set<string>();
      while (true) {
        const live = deckRef.current;
        const idx = live.findIndex(
          (s) =>
            !s.deckItemId &&
            !flushWrittenSnapshotIds.has(s.snapshotId) &&
            !hostDeckInsertIssuedRef.current.has(s.snapshotId),
        );
        if (idx < 0) break;
        const s = live[idx];
        flushWrittenSnapshotIds.add(s.snapshotId);
        console.log('[DEBUG] Host DB Write: flush insert', s.originTaskId, 'index', idx);
        const { data, error } = await supabase
          .from('live_session_deck_items')
          .insert({
            session_id: sid,
            task_id: s.originTaskId,
            sort_order: idx,
          })
          .select('id')
          .maybeSingle();
        if (error) {
          flushWrittenSnapshotIds.delete(s.snapshotId);
          logDeckWriteError('flush_insert', error);
          continue;
        }
        if (data?.id) {
          setDeck((prev) =>
            prev.map((x) =>
              x.snapshotId === s.snapshotId ? { ...x, deckItemId: data.id as string } : x,
            ),
          );
        }
      }
      moduleDeckFlushCompletedSessionId = sidTrimmed;
    })();
  }, [sidTrimmed, canPersist, supabase]);

  const addTaskToDeck = useCallback(
    (task: TaskRow) => {
      const newSnapshot = createSessionDeckSnapshot(task);
      setActiveSnapshotIdState(newSnapshot.snapshotId);
      setDeck((prevDeck) => [...prevDeck, newSnapshot]);
      queueMicrotask(() => {
        const sid = sessionIdRef.current;
        if (!canPersistRef.current || !sid) return;
        const snapId = newSnapshot.snapshotId;
        if (hostDeckInsertIssuedRef.current.has(snapId)) return;
        const anchor = deckRef.current.find((s) => s.snapshotId === snapId);
        if (!anchor || anchor.deckItemId) return;
        const sortOrder = deckRef.current.findIndex((s) => s.snapshotId === snapId);
        if (sortOrder < 0) return;
        hostDeckInsertIssuedRef.current.add(snapId);
        console.log('[DEBUG] Host DB Write: Inserting task', task.id);
        void supabase
          .from('live_session_deck_items')
          .insert({
            session_id: sid,
            task_id: task.id,
            sort_order: sortOrder,
          })
          .select('id')
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) {
              hostDeckInsertIssuedRef.current.delete(snapId);
              logDeckWriteError('add', error);
              return;
            }
            if (data?.id) {
              setDeck((p) =>
                p.map((x) =>
                  x.snapshotId === newSnapshot.snapshotId
                    ? { ...x, deckItemId: data.id as string }
                    : x,
                ),
              );
            }
          });
      });
    },
    [supabase],
  );

  const setDeckOrder = useCallback(
    (next: SetStateAction<SessionDeckSnapshot[]>) => {
      setDeck((prev) => {
        const resolved =
          typeof next === 'function'
            ? (next as (p: SessionDeckSnapshot[]) => SessionDeckSnapshot[])(prev)
            : next;

        if (canPersistRef.current && sessionIdRef.current) {
          const updates: { deckItemId: string; sort_order: number }[] = [];
          for (let i = 0; i < resolved.length; i++) {
            const s = resolved[i];
            if (!s.deckItemId) continue;
            const prevIndex = prev.findIndex((x) => x.deckRowKey === s.deckRowKey);
            if (prevIndex !== i) {
              updates.push({ deckItemId: s.deckItemId, sort_order: i });
            }
          }
          if (updates.length > 0) {
            queueMicrotask(() => {
              void (async () => {
                const results = await Promise.all(
                  updates.map((u) =>
                    supabase
                      .from('live_session_deck_items')
                      .update({ sort_order: u.sort_order })
                      .eq('id', u.deckItemId),
                  ),
                );
                for (const r of results) {
                  if (r.error) logDeckWriteError('reorder', r.error);
                }
              })();
            });
          }
        }

        return resolved;
      });
    },
    [supabase],
  );

  const updateSnapshotTask = useCallback((snapshotId: string, task: TaskRow) => {
    setDeck((prev) =>
      prev.map((s) => (s.snapshotId === snapshotId ? withSnapshotTask(s, task) : s)),
    );
  }, []);

  const removeSnapshot = useCallback(
    (snapshotId: string) => {
      let removedDeckItemId: string | null = null;
      setDeck((prev) => {
        if (!prev.some((s) => s.snapshotId === snapshotId)) return prev;
        const snap = prev.find((s) => s.snapshotId === snapshotId);
        removedDeckItemId = snap?.deckItemId ?? null;
        const next = prev.filter((s) => s.snapshotId !== snapshotId);
        setActiveSnapshotIdState((cur) =>
          cur === snapshotId ? (next[0]?.snapshotId ?? null) : cur,
        );
        return next;
      });
      queueMicrotask(() => {
        if (!removedDeckItemId || !canPersistRef.current) return;
        void supabase
          .from('live_session_deck_items')
          .delete()
          .eq('id', removedDeckItemId)
          .then(({ error }) => {
            if (error) logDeckWriteError('remove', error);
          });
      });
    },
    [supabase],
  );

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
