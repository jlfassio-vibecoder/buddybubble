import { create } from 'zustand';
import { createClient } from '@utils/supabase/client';

export type TaskBubbleUpSummary = { count: number; hasMine: boolean };

/** PostgREST / JS may disagree on UUID string casing; Set/Map lookups must be normalized. */
export function normUuid(u: string): string {
  return u.trim().toLowerCase();
}

export function mergeSummaries(
  taskIds: string[],
  rows: { task_id: string; user_id: string }[],
  authUserId: string | undefined,
): Record<string, TaskBubbleUpSummary> {
  const my = authUserId ? normUuid(authUserId) : '';
  const byId = new Map<string, Set<string>>();
  for (const id of taskIds) {
    byId.set(normUuid(id), new Set());
  }
  for (const r of rows) {
    const tid = normUuid(r.task_id);
    const s = byId.get(tid);
    if (s) s.add(normUuid(r.user_id));
  }
  const out: Record<string, TaskBubbleUpSummary> = {};
  for (const id of taskIds) {
    const bubbleSet = byId.get(normUuid(id))!;
    out[id] = {
      count: bubbleSet.size,
      hasMine: Boolean(my && bubbleSet.has(my)),
    };
  }
  return out;
}

function preservePendingSummaries(
  ids: string[],
  prev: Record<string, TaskBubbleUpSummary>,
  merged: Record<string, TaskBubbleUpSummary>,
  pending: Readonly<Record<string, true>>,
): Record<string, TaskBubbleUpSummary> {
  const out = { ...merged };
  for (const id of ids) {
    if (pending[id] && prev[id]) {
      out[id] = prev[id];
    }
  }
  return out;
}

function unionScopeIds(scopes: Record<string, readonly string[]>): string[] {
  const s = new Set<string>();
  for (const list of Object.values(scopes)) {
    for (const id of list) s.add(id);
  }
  return [...s];
}

let loadGen = 0;
let loadDebounce: ReturnType<typeof setTimeout> | null = null;
/** Sync mirror of pending for async loaders (must not lag React state). */
const pendingSync: Record<string, true> = {};
let realtimeInit = false;
let realtimeClient: ReturnType<typeof createClient> | null = null;
let realtimeChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null;

function setPendingSync(taskId: string, on: boolean) {
  if (on) pendingSync[taskId] = true;
  else delete pendingSync[taskId];
}

function initAuthOnce() {
  const w = globalThis as typeof globalThis & { __taskBubbleUpAuthInit?: boolean };
  if (w.__taskBubbleUpAuthInit) return;
  w.__taskBubbleUpAuthInit = true;
  const supabase = createClient();
  void supabase.auth.getUser().then(({ data: { user } }) => {
    useTaskBubbleUpStore.getState().setAuthUserId(user?.id ?? null);
  });
  supabase.auth.onAuthStateChange((_e, session) => {
    useTaskBubbleUpStore.getState().setAuthUserId(session?.user?.id ?? null);
  });
}

function shouldRefreshFromRealtime(payload: {
  new?: { task_id?: string | null } | null;
  old?: { task_id?: string | null } | null;
}): boolean {
  const currentIds = new Set(
    unionScopeIds(useTaskBubbleUpStore.getState().scopes).map((id) => normUuid(id)),
  );
  if (currentIds.size === 0) return false;
  const nextTaskId = payload.new?.task_id ? normUuid(payload.new.task_id) : null;
  const prevTaskId = payload.old?.task_id ? normUuid(payload.old.task_id) : null;
  return Boolean(
    (nextTaskId && currentIds.has(nextTaskId)) || (prevTaskId && currentIds.has(prevTaskId)),
  );
}

function initRealtimeOnce() {
  if (realtimeInit) return;
  realtimeInit = true;
  realtimeClient = createClient();
  realtimeChannel = realtimeClient
    .channel('task-bubble-ups-store')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'task_bubble_ups' },
      (payload: {
        new?: { task_id?: string | null } | null;
        old?: { task_id?: string | null } | null;
      }) => {
        if (shouldRefreshFromRealtime(payload)) {
          scheduleLoadUnion();
        }
      },
    )
    .subscribe();
}

function teardownRealtime() {
  if (!realtimeClient || !realtimeChannel) return;
  void realtimeClient.removeChannel(realtimeChannel);
  realtimeChannel = null;
  realtimeClient = null;
  realtimeInit = false;
}

async function runLoadUnion() {
  const { scopes, authUserId, pendingTaskIds } = useTaskBubbleUpStore.getState();
  const ids = unionScopeIds(scopes);
  const gen = ++loadGen;

  if (ids.length === 0) {
    useTaskBubbleUpStore.setState({ summaries: {} });
    return;
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('task_bubble_ups')
    .select('task_id, user_id')
    .in('task_id', ids);

  if (gen !== loadGen) return;

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[task_bubble_ups] load failed', error.message);
    }
    useTaskBubbleUpStore.setState((s) => {
      const merged = mergeSummaries(ids, [], authUserId ?? undefined);
      return {
        summaries: preservePendingSummaries(ids, s.summaries, merged, {
          ...pendingTaskIds,
          ...pendingSync,
        }),
      };
    });
    return;
  }

  const rows = (data ?? []) as { task_id: string; user_id: string }[];
  useTaskBubbleUpStore.setState((s) => {
    const merged = mergeSummaries(ids, rows, authUserId ?? undefined);
    return {
      summaries: preservePendingSummaries(ids, s.summaries, merged, {
        ...s.pendingTaskIds,
        ...pendingSync,
      }),
    };
  });
}

function scheduleLoadUnion() {
  if (loadDebounce != null) clearTimeout(loadDebounce);
  loadDebounce = setTimeout(() => {
    loadDebounce = null;
    void runLoadUnion();
  }, 32);
}

type TaskBubbleUpStoreState = {
  summaries: Record<string, TaskBubbleUpSummary>;
  pendingTaskIds: Record<string, true>;
  authUserId: string | null;
  scopes: Record<string, readonly string[]>;
  setAuthUserId: (id: string | null) => void;
  registerScope: (scopeId: string, taskIds: readonly string[]) => void;
  unregisterScope: (scopeId: string) => void;
  toggleTask: (taskId: string) => Promise<void>;
};

export const useTaskBubbleUpStore = create<TaskBubbleUpStoreState>((set) => ({
  summaries: {},
  pendingTaskIds: {},
  authUserId: null,
  scopes: {},

  setAuthUserId: (id) => {
    set({ authUserId: id });
    scheduleLoadUnion();
  },

  registerScope: (scopeId, taskIds) => {
    initAuthOnce();
    initRealtimeOnce();
    set((s) => ({
      scopes: { ...s.scopes, [scopeId]: taskIds },
    }));
    scheduleLoadUnion();
  },

  unregisterScope: (scopeId) => {
    set((s) => {
      const { [scopeId]: _, ...rest } = s.scopes;
      if (Object.keys(rest).length === 0) {
        teardownRealtime();
      }
      return { scopes: rest };
    });
    scheduleLoadUnion();
  },

  toggleTask: async (taskId: string) => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const uid = user?.id;
    if (!uid) return;

    let snapshot: TaskBubbleUpSummary = { count: 0, hasMine: false };
    let nextMine = false;

    set((s) => {
      snapshot = s.summaries[taskId] ?? { count: 0, hasMine: false };
      nextMine = !snapshot.hasMine;
      const delta = nextMine ? 1 : -1;
      const nextSummaries = {
        ...s.summaries,
        [taskId]: {
          count: Math.max(0, snapshot.count + delta),
          hasMine: nextMine,
        },
      };
      const nextPending = { ...s.pendingTaskIds, [taskId]: true as const };
      setPendingSync(taskId, true);
      return { summaries: nextSummaries, pendingTaskIds: nextPending };
    });

    try {
      if (nextMine) {
        const ins = await supabase
          .from('task_bubble_ups')
          .insert({
            task_id: taskId,
            user_id: uid,
          })
          .select('task_id, user_id');
        const err = ins.error as { code?: string } | null;
        if (err && err.code !== '23505') {
          throw ins.error;
        }
        let rows = (ins.data ?? []) as { task_id: string; user_id: string }[];
        if (err?.code === '23505' || rows.length === 0) {
          const refetch = await supabase
            .from('task_bubble_ups')
            .select('task_id, user_id')
            .eq('task_id', taskId);
          if (!refetch.error && refetch.data?.length) {
            rows = refetch.data as { task_id: string; user_id: string }[];
          }
        }
        const patch = mergeSummaries([taskId], rows, uid);
        set((s) => ({
          summaries: { ...s.summaries, [taskId]: patch[taskId] },
        }));
      } else {
        const { error: delErr } = await supabase
          .from('task_bubble_ups')
          .delete()
          .eq('task_id', taskId)
          .eq('user_id', uid);
        if (delErr) throw delErr;
        const refetch = await supabase
          .from('task_bubble_ups')
          .select('task_id, user_id')
          .eq('task_id', taskId);
        const rows = (refetch.data ?? []) as { task_id: string; user_id: string }[];
        const patch = mergeSummaries([taskId], rows, uid);
        set((s) => ({
          summaries: { ...s.summaries, [taskId]: patch[taskId] },
        }));
      }
    } catch (e) {
      set((s) => ({
        summaries: { ...s.summaries, [taskId]: snapshot },
      }));
      if (process.env.NODE_ENV === 'development') {
        console.warn('[task_bubble_ups] toggle failed', e);
      }
    } finally {
      set((s) => {
        const { [taskId]: _, ...rest } = s.pendingTaskIds;
        setPendingSync(taskId, false);
        return { pendingTaskIds: rest };
      });
    }
  },
}));
