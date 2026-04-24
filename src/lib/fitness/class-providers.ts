/**
 * Fitness class provider abstraction.
 *
 * `FitnessClassProvider` is the interface every class integration must satisfy.
 * `ManualClassProvider` is the built-in implementation backed by the Supabase
 * `class_offerings`, `class_instances`, and `class_enrollments` tables.
 *
 * Partner sync (e.g. Mindbody, ClassPass) can be added later by implementing
 * `FitnessClassProvider` and registering an instance via `CLASS_PROVIDERS`.
 */

import { createClient } from '@utils/supabase/client';
import type { ClassEnrollmentStatus, ClassInstanceStatus, Json } from '@/types/database';

// ── Domain types ─────────────────────────────────────────────────────────────

export type ClassOffering = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  duration_min: number;
  location: string | null;
};

export type ClassInstance = {
  id: string;
  offering_id: string;
  workspace_id: string;
  scheduled_at: string;
  capacity: number | null;
  status: ClassInstanceStatus;
  instructor_notes: string | null;
  /** Instance-level JSON (e.g. `live_session` for card-based live video). */
  metadata: Json;
  offering: ClassOffering;
  /** Total active (enrolled + waitlisted) enrollment count. */
  enrollment_count: number;
  /** Current user's enrollment status; null = not enrolled. */
  my_enrollment_status: ClassEnrollmentStatus | null;
  /** Database enrollment row id for the current user; null = not enrolled. */
  my_enrollment_id: string | null;
};

export type CreateOfferingInput = {
  name: string;
  description?: string | null;
  duration_min?: number;
  location?: string | null;
};

export type CreateInstanceInput = {
  offering_id: string;
  scheduled_at: string;
  capacity?: number | null;
  instructor_notes?: string | null;
};

// ── Interface ────────────────────────────────────────────────────────────────

export interface FitnessClassProvider {
  /** Stable identifier used for routing/logging. */
  readonly id: string;
  /** Display name shown in the UI. */
  readonly name: string;

  /** Return all class instances visible to the user in the given workspace. */
  listInstances(workspaceId: string, userId: string): Promise<ClassInstance[]>;

  /** Enroll the user in a class instance. Throws on error. */
  enroll(instanceId: string, userId: string, workspaceId: string): Promise<void>;

  /** Cancel the user's enrollment. Throws on error. */
  unenroll(enrollmentId: string): Promise<void>;
}

// ── ManualClassProvider ──────────────────────────────────────────────────────

export class ManualClassProvider implements FitnessClassProvider {
  readonly id = 'manual';
  readonly name = 'Manual';

  async listInstances(workspaceId: string, userId: string): Promise<ClassInstance[]> {
    const supabase = createClient();

    // 1. Fetch instances with their offering (join).
    const { data: rawInstances, error: instErr } = await supabase
      .from('class_instances')
      .select('*, offering:class_offerings(*)')
      .eq('workspace_id', workspaceId)
      .order('scheduled_at', { ascending: true });

    if (instErr) throw new Error(instErr.message);
    if (!rawInstances?.length) return [];

    const instanceIds = rawInstances.map((r) => r.id as string);

    // 2. Fetch all enrollments for this workspace to compute counts.
    const { data: allEnrollments, error: enrollErr } = await supabase
      .from('class_enrollments')
      .select('id, instance_id, user_id, status')
      .eq('workspace_id', workspaceId)
      .in('status', ['enrolled', 'waitlisted'])
      .in('instance_id', instanceIds);

    if (enrollErr) throw new Error(enrollErr.message);

    // Build lookup maps.
    const countByInstance = new Map<string, number>();
    const myEnrollmentByInstance = new Map<string, { status: ClassEnrollmentStatus; id: string }>();
    for (const e of allEnrollments ?? []) {
      const iid = e.instance_id as string;
      countByInstance.set(iid, (countByInstance.get(iid) ?? 0) + 1);
      if ((e.user_id as string) === userId) {
        myEnrollmentByInstance.set(iid, {
          status: e.status as ClassEnrollmentStatus,
          id: e.id as string,
        });
      }
    }

    return rawInstances.map((r) => {
      const offering = r.offering as ClassOffering;
      const mine = myEnrollmentByInstance.get(r.id as string) ?? null;
      return {
        id: r.id as string,
        offering_id: r.offering_id as string,
        workspace_id: r.workspace_id as string,
        scheduled_at: r.scheduled_at as string,
        capacity: r.capacity as number | null,
        status: r.status as ClassInstanceStatus,
        instructor_notes: r.instructor_notes as string | null,
        metadata: (r.metadata as Json) ?? {},
        offering,
        enrollment_count: countByInstance.get(r.id as string) ?? 0,
        my_enrollment_status: mine?.status ?? null,
        my_enrollment_id: mine?.id ?? null,
      };
    });
  }

  async enroll(instanceId: string, userId: string, workspaceId: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.from('class_enrollments').insert({
      instance_id: instanceId,
      user_id: userId,
      workspace_id: workspaceId,
      status: 'enrolled',
    });
    if (error) throw new Error(error.message);
  }

  async unenroll(enrollmentId: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.from('class_enrollments').delete().eq('id', enrollmentId);
    if (error) throw new Error(error.message);
  }
}

/** Singleton used by ClassesBoard. Swap out for partner integrations as needed. */
export const DEFAULT_CLASS_PROVIDER: FitnessClassProvider = new ManualClassProvider();
