/**
 * TaskModal: `1` = `StandardTaskChatRail` + `TaskModalChatRailAdapter`; otherwise `TaskModalCommentsPanel`.
 * See docs/refactor/standard-task-chat-rail/phase-2-task-modal-integration.md
 */
export function isStandardTaskChatRailEnabled(): boolean {
  return process.env.NEXT_PUBLIC_STANDARD_TASK_CHAT_RAIL === '1';
}
