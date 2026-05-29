'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Json, TaskRow, TaskVisibility } from '@/types/database';
import type { TaskPriority } from '@/lib/task-priority';
import { normalizeTaskPriority } from '@/lib/task-priority';
import {
  buildTaskMetadataPayload,
  metadataFieldsFromParsed,
  parseTaskMetadata,
} from '@/lib/item-metadata';
import { scheduledTimeToInputValue } from '@/lib/task-scheduled-time';
import { hasRichWorkoutSetInMetadata } from '@/lib/workout-factory/sync-workout-metadata';
import { useBoardColumnDefs } from '@/hooks/use-board-columns';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useTaskLoadAndRealtime,
  type ApplyRowContext,
} from '@/components/modals/task-modal/hooks/useTaskLoadAndRealtime';
import { useTaskOriginalSnapshot } from '@/components/modals/task-modal/hooks/useTaskOriginalSnapshot';
import { useTaskSaveAndCreate } from '@/components/modals/task-modal/hooks/useTaskSaveAndCreate';
import { useWorkoutOutlineEditor } from '@/components/modals/task-modal/hooks/useWorkoutOutlineEditor';
import type { WorkoutBuilderTaskPayload } from '@/features/workout-builder/types/workout-builder-task';
import type { TaskActivityEntry } from '@/types/task-modal';

function exerciseNamesFromDraftBlocks(blocks: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const block of blocks) {
    const exercises = Array.isArray(block.exercises) ? block.exercises : [];
    for (const ex of exercises) {
      if (!ex || typeof ex !== 'object') continue;
      const name =
        typeof (ex as { exercise?: unknown }).exercise === 'string'
          ? (ex as { exercise: string }).exercise
          : typeof (ex as { name?: unknown }).name === 'string'
            ? (ex as { name: string }).name
            : '';
      const t = name.trim();
      const k = t.toLowerCase();
      if (!t || seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
  }
  return out;
}

export type UseWorkoutBuilderTaskHostArgs = {
  workspaceId: string;
  initialTask: WorkoutBuilderTaskPayload;
};

export function useWorkoutBuilderTaskHost({
  workspaceId,
  initialTask,
}: UseWorkoutBuilderTaskHostArgs) {
  const router = useRouter();
  const taskId = initialTask.id;
  const perms = usePermissions(initialTask.memberRole);
  const canWrite = perms.canWriteTasks;
  const canPostMessages = perms.canPostMessages;

  const boardColumnDefs = useBoardColumnDefs(workspaceId);
  const hasTodayBoardColumn = useMemo(
    () => boardColumnDefs?.some((c) => c.id === 'today') ?? false,
    [boardColumnDefs],
  );
  const hasScheduledBoardColumn = useMemo(
    () => boardColumnDefs?.some((c) => c.id === 'scheduled') ?? false,
    [boardColumnDefs],
  );

  const defaultStatus = boardColumnDefs?.[0]?.id ?? 'todo';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(initialTask.title ?? '');
  const [description, setDescription] = useState(initialTask.description ?? '');
  const [status, setStatus] = useState(defaultStatus);
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [scheduledOn, setScheduledOn] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [itemType] = useState<'workout'>('workout');
  const [metadata, setMetadata] = useState<Json>(initialTask.metadata ?? {});
  const [visibility, setVisibility] = useState<TaskVisibility>('private');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [liveStreamEnabled] = useState(false);
  const [activityLog, setActivityLog] = useState<TaskActivityEntry[]>([]);
  const [bubbleId, setBubbleId] = useState(initialTask.bubble_id);
  const [workoutType, setWorkoutType] = useState('');
  const [workoutDurationMin, setWorkoutDurationMin] = useState('');
  const [workoutExercises, setWorkoutExercises] = useState(
    () => metadataFieldsFromParsed(parseTaskMetadata(initialTask.metadata)).workoutExercises,
  );
  const [cardCoverPath, setCardCoverPath] = useState(
    () => metadataFieldsFromParsed(parseTaskMetadata(initialTask.metadata)).cardCoverPath,
  );

  const metadataRef = useRef(metadata);
  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  const { originalRef, setOriginalFromAppliedRow, patchOriginalMetadataJson } =
    useTaskOriginalSnapshot();

  useEffect(() => {
    const meta = parseTaskMetadata(initialTask.metadata);
    const mf = metadataFieldsFromParsed(meta);
    setOriginalFromAppliedRow({
      title: initialTask.title ?? '',
      description: initialTask.description ?? '',
      status: defaultStatus,
      priority: 'medium',
      scheduledOn: null,
      scheduledTime: null,
      itemType: 'workout',
      metadataJson: JSON.stringify(buildTaskMetadataPayload('workout', mf, meta)),
      visibility: 'private',
      assignedTo: null,
      liveStreamEnabled: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once from server payload
  }, []);

  const metadataForSave = useMemo(
    () =>
      buildTaskMetadataPayload(
        'workout',
        {
          eventLocation: '',
          eventUrl: '',
          experienceSeason: '',
          experienceEndDate: '',
          memoryCaption: '',
          workoutType,
          workoutDurationMin,
          workoutExercises,
          programGoal: '',
          programDurationWeeks: '',
          programCurrentWeek: 0,
          programSchedule: [],
          programSourceTitle: '',
          cardCoverPath,
        },
        metadata,
      ),
    [workoutType, workoutDurationMin, workoutExercises, cardCoverPath, metadata],
  );

  const applyRow = useCallback(
    (row: TaskRow, ctx: ApplyRowContext = { silent: false }) => {
      const silent = ctx.silent === true;
      setTitle(row.title);
      setDescription(row.description ?? '');
      const nextStatus = row.status || defaultStatus;
      const nextPriority = normalizeTaskPriority(row.priority);
      setStatus(nextStatus);
      setPriority(nextPriority);
      setScheduledOn(row.scheduled_on ? String(row.scheduled_on).slice(0, 10) : '');
      setScheduledTime(scheduledTimeToInputValue(row.scheduled_time));
      setBubbleId(row.bubble_id);

      const nextMeta = parseTaskMetadata(row.metadata);
      const preserveLocalRichWorkout =
        silent &&
        hasRichWorkoutSetInMetadata(metadataRef.current) &&
        !hasRichWorkoutSetInMetadata(nextMeta);
      const metaToApply = preserveLocalRichWorkout
        ? parseTaskMetadata(metadataRef.current)
        : nextMeta;
      setMetadata(metaToApply);
      const mf = metadataFieldsFromParsed(metaToApply);
      setWorkoutType(mf.workoutType);
      setWorkoutDurationMin(mf.workoutDurationMin);
      setWorkoutExercises(mf.workoutExercises);
      setCardCoverPath(mf.cardCoverPath);

      const vis = row.visibility === 'public' ? 'public' : 'private';
      setVisibility(vis);
      const assigneeRows = (row as TaskRow & { task_assignees?: { user_id: string }[] | null })
        .task_assignees;
      const assignee =
        assigneeRows?.find((r) => typeof r.user_id === 'string' && r.user_id.trim())?.user_id ??
        null;
      setAssignedTo(assignee);

      const st = scheduledTimeToInputValue(row.scheduled_time);
      if (!silent) {
        setOriginalFromAppliedRow({
          title: row.title,
          description: row.description ?? '',
          status: nextStatus,
          priority: nextPriority,
          scheduledOn: row.scheduled_on ? String(row.scheduled_on).slice(0, 10) : null,
          scheduledTime: st || null,
          itemType: 'workout',
          metadataJson: JSON.stringify(buildTaskMetadataPayload('workout', mf, metaToApply)),
          visibility: vis,
          assignedTo: assignee,
          liveStreamEnabled: false,
        });
      }
    },
    [defaultStatus, setOriginalFromAppliedRow],
  );

  const onResetForCreate = useCallback(() => {
    /* Builder route is edit-only. */
  }, []);

  const handleTaskRowDeleted = useCallback(() => {
    router.replace(`/app/${workspaceId}`);
  }, [router, workspaceId]);

  const { loadTask } = useTaskLoadAndRealtime({
    open: true,
    taskId,
    applyRow,
    onResetForCreate,
    setLoading,
    setError,
    onTaskRowDeleted: handleTaskRowDeleted,
    realtimeChannelPrefix: 'workout-builder',
  });

  const { saveCoreFields } = useTaskSaveAndCreate({
    canWrite,
    taskId,
    bubbleId,
    workspaceId,
    loadTask,
    onOpenChange: () => {},
    title,
    description,
    status,
    priority,
    scheduledOn,
    scheduledTime,
    itemType,
    visibility,
    assignedTo,
    metadataForSave,
    liveStreamEnabled,
    boardColumnDefs,
    hasTodayBoardColumn,
    hasScheduledBoardColumn,
    calendarTimezone: null,
    activityLog,
    setActivityLog,
    setStatus,
    setPriority,
    setScheduledOn,
    setScheduledTime,
    setVisibility,
    setError,
    setSaving,
    originalRef,
    setOriginalFromAppliedRow,
  });

  const outlineEditor = useWorkoutOutlineEditor({
    canWrite,
    taskId,
    workspaceId,
    title,
    description,
    metadata,
    setMetadata,
    patchOriginalMetadataJson,
    saveCoreFields,
  });

  const workoutHashExerciseNames = useMemo(
    () => exerciseNamesFromDraftBlocks(outlineEditor.draftBlocks),
    [outlineEditor.draftBlocks],
  );

  return {
    taskId,
    workspaceId,
    bubbleId,
    title,
    description,
    metadata,
    setMetadata,
    loading,
    saving,
    error,
    canWrite,
    canPostMessages,
    outlineEditor,
    workoutHashExerciseNames,
    workoutDurationMin,
    workoutExercises,
    setTitle,
    setDescription,
    setWorkoutType,
    setWorkoutDurationMin,
    setWorkoutExercises,
    loadTask,
    saveCoreFields,
    metadataForSave,
    originalRef,
    itemType,
    status,
    priority,
    scheduledOn,
    scheduledTime,
    visibility,
    assignedTo,
    liveStreamEnabled,
  };
}
