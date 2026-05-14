/**
 * Silent system-message sentinel that wakes the Buddy agent on first entry into an empty chat
 * context. Keep in sync with `supabase/functions/buddy-agent-dispatch` and the duplicates in
 * `src/components/chat/ChatArea.tsx` and `src/components/modals/task-modal/TaskModalCommentsPanel.tsx`.
 * Phase 2 does not refactor those call sites; consolidate when the legacy panel is removed (Phase 4).
 */
export const BUDDY_ONBOARDING_SYSTEM_EVENT = '[SYSTEM_EVENT: ONBOARDING_STARTED]';
