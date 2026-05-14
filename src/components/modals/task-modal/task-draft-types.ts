import type { TaskSubtask, TaskAttachment } from '@/types/task-modal';

/**
 * Snapshot of task modal fields used to detect "untouched" optimistic drafts
 * for auto-delete on modal close (Phase 3.8).
 */
export type TaskDraftBaseline = {
  title: string;
  description: string | null;
  metadataJson: string;
  priority: string;
  visibility: string;
  status: string;
  position: number;
  scheduledOn: string;
  scheduledTime: string;
  attachmentsJson: string;
  subtasksJson: string;
};

export function serializeSubtasksForBaseline(subtasks: TaskSubtask[]): string {
  const sorted = [...subtasks].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(
    sorted.map((s) => ({ id: s.id, title: s.title, done: s.done, created_at: s.created_at })),
  );
}

export function serializeAttachmentsForBaseline(attachments: TaskAttachment[]): string {
  const sorted = [...attachments].sort((a, b) => (a.path || '').localeCompare(b.path || ''));
  return JSON.stringify(sorted);
}

export function buildCurrentDraftSnapshot(args: {
  title: string;
  description: string;
  metadataForSave: unknown;
  priority: string;
  visibility: string;
  status: string;
  position: number;
  scheduledOn: string;
  scheduledTime: string;
  attachments: TaskAttachment[];
  subtasks: TaskSubtask[];
}): TaskDraftBaseline {
  return {
    title: args.title.trim(),
    description: args.description.trim() || null,
    metadataJson: JSON.stringify(args.metadataForSave),
    priority: args.priority,
    visibility: args.visibility,
    status: args.status,
    position: args.position,
    scheduledOn: args.scheduledOn,
    scheduledTime: args.scheduledTime,
    attachmentsJson: serializeAttachmentsForBaseline(args.attachments),
    subtasksJson: serializeSubtasksForBaseline(args.subtasks),
  };
}

export function isDraftUntouched(baseline: TaskDraftBaseline, current: TaskDraftBaseline): boolean {
  return (
    baseline.title === current.title &&
    (baseline.description || '') === (current.description || '') &&
    baseline.metadataJson === current.metadataJson &&
    baseline.priority === current.priority &&
    baseline.visibility === current.visibility &&
    baseline.status === current.status &&
    baseline.position === current.position &&
    baseline.scheduledOn === current.scheduledOn &&
    baseline.scheduledTime === current.scheduledTime &&
    baseline.attachmentsJson === current.attachmentsJson &&
    baseline.subtasksJson === current.subtasksJson
  );
}
