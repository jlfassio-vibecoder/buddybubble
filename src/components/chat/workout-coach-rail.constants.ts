/** Shared message metadata keys for Workout Coach rail + Active Session sentinel sends. */
export const CHAT_AREA_DEFAULT_AGENT_SLUG = 'coach';
/** Persisted on `messages.metadata` for root inserts; `agent-dispatch` reads this key. */
export const MESSAGE_METADATA_DEFAULT_AGENT_SLUG_KEY = 'default_agent_slug' as const;
/** Server reads this for the opening greeting copy (`agent-dispatch`). */
export const MESSAGE_METADATA_WORKOUT_TASK_TITLE_KEY = 'workout_task_title' as const;
