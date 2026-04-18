/**
 * Lightweight TaskModal open options.
 *
 * NOTE: Duplicated from `src/components/modals/TaskModal.tsx` to avoid importing that module
 * while task modal types are temporarily in flux during the unified chat migration.
 */
export type TaskModalTab = 'details' | 'comments' | 'subtasks' | 'activity';

export type TaskModalViewMode = 'full' | 'comments-only';

export type OpenTaskOptions = {
  tab?: TaskModalTab;
  viewMode?: TaskModalViewMode;
  /** When true (e.g. Kanban pencil), workout cards open the first exercise row in edit mode immediately. */
  autoEdit?: boolean;
  /** When true (e.g. Kanban quick view), open the workout viewer after the task loads. */
  openWorkoutViewer?: boolean;
  /**
   * `messages.id` for a task-scoped comment or reply; opens that thread in TaskModal Comments after load.
   * Replies use `parent_id` to resolve the root thread parent.
   */
  commentThreadMessageId?: string | null;
  /**
   * Bubble `messages.id` (e.g. coach reply in Messages rail) with `attached_task_id` = card.
   * ChatArea resolves this to a task-scoped `messages.id` before opening TaskModal.
   */
  taskCommentAnchorBubbleMessageId?: string | null;
};
