import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  sortPublicFeedItems,
  type PublicFeedItem,
  type PublicClassCardData,
  type TaskCardShape,
} from '../lib/public-feed-types';
import { normalizeClassInstanceRow } from '../lib/supabase-embed';

type TaskRowPayload = {
  id?: string;
  bubble_id?: string;
  visibility?: string;
  item_type?: string;
  title?: string;
  description?: string | null;
  metadata?: unknown;
  scheduled_on?: string | null;
  created_at?: string;
};

type ClassRowPayload = {
  id?: string;
  task_id?: string;
  workspace_id?: string;
  visibility?: string;
  status?: string;
  scheduled_at?: string;
};

function isFutureOrNow(iso: string): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= Date.now() - 60_000;
}

function taskSortAt(card: TaskCardShape): string {
  return card.scheduled_on?.trim() || card.created_at;
}

async function fetchTaskFeedItem(
  supabase: SupabaseClient,
  taskId: string,
  bubbleId: string,
): Promise<PublicFeedItem | null> {
  const { data, error } = await supabase
    .from('tasks')
    .select(
      'id, title, description, item_type, metadata, scheduled_on, created_at, bubble_id, visibility',
    )
    .eq('id', taskId)
    .maybeSingle();

  if (error || !data || data.visibility !== 'public') return null;

  const card = data as TaskCardShape & { bubble_id: string; item_type?: string };
  if ((card.item_type || '').toLowerCase() === 'class') return null;
  return {
    kind: 'task',
    taskId: card.id,
    bubbleId: card.bubble_id ?? bubbleId,
    sortAt: taskSortAt(card),
    card,
  };
}

async function fetchClassFeedItem(
  supabase: SupabaseClient,
  instanceId: string,
): Promise<PublicFeedItem | null> {
  const { data, error } = await supabase
    .from('class_instances')
    .select(
      `
      id,
      task_id,
      scheduled_at,
      status,
      visibility,
      offering:class_offerings (
        name,
        description,
        duration_min,
        location
      ),
      tasks (
        bubble_id
      )
    `,
    )
    .eq('id', instanceId)
    .maybeSingle();

  if (error || !data) return null;

  const rawVisibility = (data as { visibility?: string }).visibility;
  if (rawVisibility !== 'public') return null;

  const row = normalizeClassInstanceRow(data);
  if (!row) return null;

  if (
    row.status !== 'available' ||
    !isFutureOrNow(row.scheduled_at) ||
    !row.offering?.name ||
    !row.task_id
  ) {
    return null;
  }

  const bubbleId = row.tasks?.bubble_id;
  if (!bubbleId) return null;

  const instance: PublicClassCardData = {
    id: row.id,
    task_id: row.task_id,
    scheduled_at: row.scheduled_at,
    offering: row.offering,
  };

  return {
    kind: 'class',
    taskId: row.task_id,
    bubbleId,
    sortAt: row.scheduled_at,
    instance,
  };
}

function upsertItem(prev: PublicFeedItem[], next: PublicFeedItem): PublicFeedItem[] {
  const key = next.kind === 'task' ? `task:${next.taskId}` : `class:${next.instance.id}`;
  const without = prev.filter((item) => {
    const k = item.kind === 'task' ? `task:${item.taskId}` : `class:${item.instance.id}`;
    return k !== key;
  });
  return sortPublicFeedItems([...without, next]);
}

function removeTask(prev: PublicFeedItem[], taskId: string): PublicFeedItem[] {
  return prev.filter((item) => !(item.kind === 'task' && item.taskId === taskId));
}

function removeClass(prev: PublicFeedItem[], instanceId: string): PublicFeedItem[] {
  return prev.filter((item) => !(item.kind === 'class' && item.instance.id === instanceId));
}

export function usePublicFeedRealtime(
  supabase: SupabaseClient | null,
  workspaceId: string,
  bubbleIds: readonly string[],
  initialFeed: PublicFeedItem[],
) {
  const [items, setItems] = useState<PublicFeedItem[]>(() => sortPublicFeedItems(initialFeed));
  const bubbleIdSetRef = useRef(new Set(bubbleIds));
  const pendingRef = useRef(new Set<string>());

  useEffect(() => {
    setItems(sortPublicFeedItems(initialFeed));
  }, [initialFeed]);

  useEffect(() => {
    bubbleIdSetRef.current = new Set(bubbleIds);
  }, [bubbleIds]);

  const scheduleTaskRefresh = useCallback(
    (taskId: string, bubbleId?: string) => {
      if (!supabase) return;
      const key = `task:${taskId}`;
      if (pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      void (async () => {
        try {
          const item = await fetchTaskFeedItem(supabase, taskId, bubbleId ?? '');
          setItems((prev) => {
            if (!item) return removeTask(prev, taskId);
            return upsertItem(prev, item);
          });
        } finally {
          pendingRef.current.delete(key);
        }
      })();
    },
    [supabase],
  );

  const scheduleClassRefresh = useCallback(
    (instanceId: string) => {
      if (!supabase) return;
      const key = `class:${instanceId}`;
      if (pendingRef.current.has(key)) return;
      pendingRef.current.add(key);
      void (async () => {
        try {
          const item = await fetchClassFeedItem(supabase, instanceId);
          setItems((prev) => {
            if (!item) return removeClass(prev, instanceId);
            return upsertItem(prev, item);
          });
        } finally {
          pendingRef.current.delete(key);
        }
      })();
    },
    [supabase],
  );

  useEffect(() => {
    if (!supabase || !workspaceId) return;

    const channel = supabase
      .channel(`storefront-feed:${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        const row = (payload.new ?? payload.old) as TaskRowPayload | undefined;
        const taskId = row?.id;
        if (!taskId) return;

        if (payload.eventType === 'DELETE') {
          setItems((prev) => removeTask(prev, taskId));
          return;
        }

        const bubbleScope = bubbleIdSetRef.current;
        if (bubbleScope.size === 0) return;

        const bubbleId = row?.bubble_id;
        if (!bubbleId || !bubbleScope.has(bubbleId)) {
          setItems((prev) => removeTask(prev, taskId));
          return;
        }

        if (row?.visibility !== 'public' || (row?.item_type || '').toLowerCase() === 'class') {
          setItems((prev) => removeTask(prev, taskId));
          return;
        }

        scheduleTaskRefresh(taskId, bubbleId);
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'class_instances',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as ClassRowPayload | undefined;
          const instanceId = row?.id;
          if (!instanceId) return;

          if (payload.eventType === 'DELETE') {
            setItems((prev) => removeClass(prev, instanceId));
            return;
          }

          scheduleClassRefresh(instanceId);
        },
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [supabase, workspaceId, scheduleTaskRefresh, scheduleClassRefresh]);

  return items;
}
