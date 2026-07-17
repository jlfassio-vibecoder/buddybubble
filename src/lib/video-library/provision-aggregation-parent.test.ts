import { describe, expect, it, vi } from 'vitest';
import {
  AGGREGATION_OFFERING_NAME_FALLBACK,
  buildAggregationInstanceMetadata,
  isVideoAggregationMetadata,
  provisionAggregationParent,
} from './provision-aggregation-parent';

describe('buildAggregationInstanceMetadata', () => {
  it('writes video_aggregation marker only', () => {
    expect(buildAggregationInstanceMetadata()).toEqual({
      video_aggregation: { type: 'video_aggregation', version: 1 },
    });
  });
});

describe('isVideoAggregationMetadata', () => {
  it('detects aggregation parents', () => {
    expect(isVideoAggregationMetadata(buildAggregationInstanceMetadata())).toBe(true);
    expect(isVideoAggregationMetadata({ class_recording: { type: 'class_recording' } })).toBe(
      false,
    );
    expect(isVideoAggregationMetadata(null)).toBe(false);
  });
});

function mockSupabase(opts: {
  bubbles?: { id: string; name: string }[];
  offeringId?: string;
  taskId?: string;
  instanceId?: string;
  failAt?: 'offering' | 'task' | 'instance' | 'metadata';
}) {
  const deletes: string[] = [];
  const offeringId = opts.offeringId ?? 'off-1';
  const taskId = opts.taskId ?? 'task-1';
  const instanceId = opts.instanceId ?? 'inst-1';

  const from = (table: string) => {
    if (table === 'bubbles') {
      return {
        select: () => ({
          eq: () =>
            Promise.resolve({
              data: opts.bubbles ?? [{ id: 'bub-classes', name: 'Classes' }],
              error: null,
            }),
        }),
      };
    }
    if (table === 'class_offerings') {
      return {
        insert: () => ({
          select: () => ({
            maybeSingle: () =>
              opts.failAt === 'offering'
                ? Promise.resolve({ data: null, error: { message: 'offering fail' } })
                : Promise.resolve({ data: { id: offeringId }, error: null }),
          }),
        }),
        delete: () => ({
          eq: () => {
            deletes.push(`offering:${offeringId}`);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === 'tasks') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: { position: 2 }, error: null }),
              }),
            }),
          }),
        }),
        insert: () => ({
          select: () => ({
            maybeSingle: () =>
              opts.failAt === 'task'
                ? Promise.resolve({ data: null, error: { message: 'task fail' } })
                : Promise.resolve({ data: { id: taskId }, error: null }),
          }),
        }),
        delete: () => ({
          eq: () => {
            deletes.push(`task:${taskId}`);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === 'class_instances') {
      return {
        insert: () => ({
          select: () => ({
            maybeSingle: () =>
              opts.failAt === 'instance'
                ? Promise.resolve({ data: null, error: { message: 'instance fail' } })
                : Promise.resolve({ data: { id: instanceId }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () =>
                opts.failAt === 'metadata'
                  ? Promise.resolve({ data: null, error: { message: 'metadata fail' } })
                  : Promise.resolve({ data: { id: instanceId }, error: null }),
            }),
          }),
        }),
        delete: () => ({
          eq: () => {
            deletes.push(`instance:${instanceId}`);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  };

  return {
    supabase: { from: vi.fn(from) } as never,
    deletes,
    offeringId,
    taskId,
    instanceId,
  };
}

describe('provisionAggregationParent', () => {
  it('creates offering, task, and instance with aggregation metadata', async () => {
    const { supabase, instanceId, offeringId, taskId } = mockSupabase({});
    const res = await provisionAggregationParent({
      supabase,
      workspaceId: 'ws-1',
      hostUserId: 'user-1',
      title: 'Morning Stack',
      durationMin: 40,
      nowIso: '2026-07-17T12:00:00.000Z',
    });
    expect(res).toEqual({ ok: true, instanceId, offeringId, taskId });
  });

  it('uses fallback title when blank', async () => {
    expect(AGGREGATION_OFFERING_NAME_FALLBACK).toBe('Aggregated Workout');
    const { supabase } = mockSupabase({});
    const res = await provisionAggregationParent({
      supabase,
      workspaceId: 'ws-1',
      hostUserId: 'user-1',
      title: '   ',
    });
    expect(res.ok).toBe(true);
  });

  it('fails when Classes bubble is missing', async () => {
    const { supabase } = mockSupabase({ bubbles: [{ id: 'b1', name: 'Programs' }] });
    const res = await provisionAggregationParent({
      supabase,
      workspaceId: 'ws-1',
      hostUserId: 'user-1',
      title: 'Stack',
    });
    expect(res).toEqual({
      ok: false,
      error: 'Add a Classes channel before creating an aggregated workout.',
    });
  });

  it('cleans up offering and task when metadata update fails', async () => {
    const { supabase, deletes, offeringId, taskId, instanceId } = mockSupabase({
      failAt: 'metadata',
    });
    const res = await provisionAggregationParent({
      supabase,
      workspaceId: 'ws-1',
      hostUserId: 'user-1',
      title: 'Stack',
    });
    expect(res.ok).toBe(false);
    expect(deletes).toEqual([`instance:${instanceId}`, `task:${taskId}`, `offering:${offeringId}`]);
  });
});
