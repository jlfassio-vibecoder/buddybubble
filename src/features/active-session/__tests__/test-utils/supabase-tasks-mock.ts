import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/types/database';

export type TemplateUpdate = {
  metadata: Record<string, unknown>;
  id: string;
  itemType?: string;
};

export type TaskLogInsertCapture = {
  bubble_id: string;
  item_type: string;
  status: string;
};

export type FinishSupabaseMockOptions = {
  sourceMetadata?: Json | null;
  insertedLogId?: string;
};

export function createFinishSupabaseMock(options: FinishSupabaseMockOptions = {}) {
  const templateUpdates: TemplateUpdate[] = [];
  const logUpdates: Array<{ id: string; status: string }> = [];
  const staleDraftDeletes: Array<{ finishedLogId: string }> = [];
  const logInserts: TaskLogInsertCapture[] = [];

  const sourceRow = {
    metadata: options.sourceMetadata ?? { workout_type: 'Strength' },
    program_id: null,
    program_session_key: null,
    scheduled_on: null,
    scheduled_time: null,
    visibility: null,
    task_assignees: [{ user_id: 'user-1' }],
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== 'tasks') {
        throw new Error(`expected tasks table, got ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: sourceRow, error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          let idFilter: string | undefined;
          const isTemplatePatch =
            payload.metadata != null && payload.status == null && payload.bubble_id == null;
          const updateChain = {
            eq: vi.fn((col: string, val: string) => {
              if (col === 'id') {
                idFilter = val;
                if (isTemplatePatch) {
                  return updateChain;
                }
                if (payload.status === 'completed') {
                  logUpdates.push({ id: val, status: String(payload.status) });
                }
                return Promise.resolve({ error: null });
              }
              if (col === 'item_type') {
                templateUpdates.push({
                  metadata: payload.metadata as Record<string, unknown>,
                  id: idFilter ?? '',
                  itemType: val,
                });
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: null });
            }),
          };
          return updateChain;
        }),
        insert: vi.fn((payload: Record<string, unknown>) => {
          logInserts.push({
            bubble_id: String(payload.bubble_id),
            item_type: String(payload.item_type),
            status: String(payload.status),
          });
          return {
            select: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { id: options.insertedLogId ?? 'inserted-log-001' },
                error: null,
              })),
            })),
          };
        }),
        delete: vi.fn(() => {
          const deleteChain = {
            eq: vi.fn((_col: string, val: string) => {
              if (_col === 'id' && typeof val === 'string' && val.startsWith('neq-')) {
                return deleteChain;
              }
              return deleteChain;
            }),
            neq: vi.fn((_col: string, finishedLogId: string) => {
              staleDraftDeletes.push({ finishedLogId });
              return Promise.resolve({ error: null });
            }),
          };
          return deleteChain;
        }),
      };
    }),
  } as unknown as SupabaseClient;

  return { supabase, templateUpdates, logUpdates, logInserts, staleDraftDeletes };
}
