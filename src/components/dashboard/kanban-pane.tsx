'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@utils/supabase/client';
import type { TaskRow } from '@/types/database';
import type { TaskStatus } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

type Props = {
  bubbleId: string | null;
  canWrite: boolean;
};

export function KanbanPane({ bubbleId, canWrite }: Props) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!bubbleId) {
      setTasks([]);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from('tasks')
      .select('*')
      .eq('bubble_id', bubbleId)
      .order('position', { ascending: true });
    setTasks(data ?? []);
  }, [bubbleId]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    if (!bubbleId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`tasks:${bubbleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `bubble_id=eq.${bubbleId}`,
        },
        () => {
          void loadTasks();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bubbleId, loadTasks]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskRow[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const t of tasks) {
      const s = (t.status as TaskStatus) || 'todo';
      if (map[s]) map[s].push(t);
      else map.todo.push(t);
    }
    return map;
  }, [tasks]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!bubbleId || !title.trim() || !canWrite) return;
    setAdding(true);
    const supabase = createClient();
    const maxPos =
      tasks.length > 0 ? Math.max(...tasks.map((t) => t.position ?? 0)) + 1 : 0;
    const { error } = await supabase.from('tasks').insert({
      bubble_id: bubbleId,
      title: title.trim(),
      status: 'todo',
      position: maxPos,
    });
    setAdding(false);
    if (!error) {
      setTitle('');
      void loadTasks();
    }
  }

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    if (!canWrite) return;
    const supabase = createClient();
    await supabase.from('tasks').update({ status }).eq('id', taskId);
    void loadTasks();
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
      <div className="border-b border-border bg-background px-4 py-3">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <p className="text-xs text-muted-foreground">Move tasks between columns</p>
      </div>
      {canWrite && bubbleId && (
        <form onSubmit={addTask} className="flex gap-2 border-b border-border bg-background p-3">
          <Input
            placeholder="New task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 text-sm"
          />
          <Button type="submit" size="sm" disabled={adding || !title.trim()}>
            Add
          </Button>
        </form>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 p-3">
        {COLUMNS.map((col) => (
          <div
            key={col.id}
            className="flex min-h-[200px] flex-col rounded-lg border border-border bg-card p-2"
          >
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              {col.label}
            </h3>
            <ScrollArea className="h-[calc(100vh-220px)]">
              {tasksByStatus[col.id].map((task) => (
                <Card key={task.id} className="mb-2">
                  <CardContent className="space-y-2 p-3 text-sm">
                    <p className="font-medium">{task.title}</p>
                    {task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-3">{task.description}</p>
                    )}
                    {canWrite && (
                      <select
                        value={task.status}
                        onChange={(e) =>
                          void updateTaskStatus(task.id, e.target.value as TaskStatus)
                        }
                        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </CardContent>
                </Card>
              ))}
            </ScrollArea>
          </div>
        ))}
      </div>
    </div>
  );
}
