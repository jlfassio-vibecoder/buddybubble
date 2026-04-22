/**
 * Re-export Supabase-generated types from `database.generated.ts`, plus app-level unions and
 * `Tables[...]['Row']` aliases used across the app.
 *
 * Regenerate the schema snapshot (then refresh this barrel if needed):
 * `supabase gen types typescript --linked > src/types/database.generated.ts`
 *
 * Runtime helpers for `tasks.item_type` live in `@/lib/item-types` (safe from CLI regen).
 */
export * from './database.generated';

import type {
  BubbleType,
  LeadRowSource,
  WorkspaceMemberOnboardingStatus,
} from '@/lib/leads-source';

export type {
  BubbleType,
  LeadRowSource,
  WorkspaceMemberOnboardingStatus,
} from '@/lib/leads-source';

import type { Database } from './database.generated';

export type { ItemType } from '@/lib/item-types';

/** Template for a new BuddyBubble (`workspaces.category_type`). */
export type WorkspaceCategory = 'business' | 'kids' | 'class' | 'community' | 'fitness';
export type MemberRole = 'owner' | 'admin' | 'member' | 'guest' | 'trialing';
export type BubbleMemberRole = 'editor' | 'viewer';
export type InviteType = 'qr' | 'link' | 'email' | 'sms';
export type InvitationJoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
/** Built-in Kanban slugs; `tasks.status` may also use workspace-specific slugs from `board_columns`. */
export type TaskStatus = 'todo' | 'in_progress' | 'done';

/** Storefront visibility for `public.tasks.visibility`. */
export type TaskVisibility = 'private' | 'public';

/** Fitness unit preference. */
export type UnitSystem = 'metric' | 'imperial';

/** Status of a class instance. */
export type ClassInstanceStatus = 'available' | 'cancelled' | 'completed';

/** Status of a user's enrollment in a class instance. */
export type ClassEnrollmentStatus = 'enrolled' | 'waitlisted' | 'cancelled' | 'completed';

/**
 * Subscription lifecycle for business/fitness workspaces.
 * Mirrors the CHECK constraint on `workspace_subscriptions.status`.
 */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'trial_expired'
  | 'canceled'
  | 'incomplete';

export type FitnessProfileRow = Database['public']['Tables']['fitness_profiles']['Row'];
export type ClassOfferingRow = Database['public']['Tables']['class_offerings']['Row'];
export type ClassInstanceRow = Database['public']['Tables']['class_instances']['Row'];
export type ClassEnrollmentRow = Database['public']['Tables']['class_enrollments']['Row'];
export type BubbleRow = Database['public']['Tables']['bubbles']['Row'];
export type BubbleMemberRow = Database['public']['Tables']['bubble_members']['Row'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];

/**
 * Many-to-many task assignments (`public.task_assignees`: `task_id` + `user_id`).
 * Legacy `tasks.assigned_to` was removed; filter with `task_assignees!inner(user_id)` or sync via
 * `replaceTaskAssigneesWithUserIds` in `@/lib/task-assignees-db`.
 */
export type TaskAssigneeRow = Database['public']['Tables']['task_assignees']['Row'];

/** Row shape when loading messages with a left-joined task embed (`tasks(*)` in ChatArea). */
export type MessageRowWithEmbeddedTask = MessageRow & {
  tasks: TaskRow | null;
};
export type StorefrontSandboxMessageRow =
  Database['public']['Tables']['storefront_sandbox_messages']['Row'];
export type LeadRow = Database['public']['Tables']['leads']['Row'];
export type StripeCustomerRow = Database['public']['Tables']['stripe_customers']['Row'];
export type WorkspaceSubscriptionRow =
  Database['public']['Tables']['workspace_subscriptions']['Row'];
export type AnalyticsEventRow = Database['public']['Tables']['analytics_events']['Row'];
export type ExerciseDictionaryRow = Database['public']['Tables']['exercise_dictionary']['Row'];
export type AgentDefinitionRow = Database['public']['Tables']['agent_definitions']['Row'];
export type AgentMessageRunRow = Database['public']['Tables']['agent_message_runs']['Row'];
export type BubbleAgentBindingRow = Database['public']['Tables']['bubble_agent_bindings']['Row'];

/**
 * Trial & Member Access (normalized per-role permissions).
 *
 * These tables are defined in `supabase/migrations/20260629120000_workspace_role_access_tables.sql`.
 * Hand-authored here until the next `supabase gen types typescript --linked` regenerates
 * `database.generated.ts`; once regenerated, prefer the generated aliases.
 *
 * Canonical feature keys are owned by the app (`TRIAL_MEMBER_FEATURE_KEYS` in the feature
 * module); `feature_key` is intentionally TEXT in the DB to avoid a migration per new flag.
 */
export type WorkspaceRoleFeatureFlagRow = {
  workspace_id: string;
  role: MemberRole;
  feature_key: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRoleFeatureFlagInsert = {
  workspace_id: string;
  role: MemberRole;
  feature_key: string;
  is_enabled?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type WorkspaceRoleFeatureFlagUpdate = Partial<WorkspaceRoleFeatureFlagInsert>;

export type WorkspaceRoleDefaultBubbleRow = {
  workspace_id: string;
  role: MemberRole;
  bubble_id: string;
  created_at: string;
};

export type WorkspaceRoleDefaultBubbleInsert = {
  workspace_id: string;
  role: MemberRole;
  bubble_id: string;
  created_at?: string;
};

export type WorkspaceRoleDefaultBubbleUpdate = Partial<WorkspaceRoleDefaultBubbleInsert>;

export type ProgramRow = Database['public']['Tables']['programs']['Row'];
export type ProgramWeekRow = Database['public']['Tables']['program_weeks']['Row'];
export type HubWorkoutRow = Database['public']['Tables']['workouts']['Row'];
export type ChallengeRow = Database['public']['Tables']['challenges']['Row'];
export type ChallengeWeekRow = Database['public']['Tables']['challenge_weeks']['Row'];
export type WorkoutLogRow = Database['public']['Tables']['workout_logs']['Row'];
export type UserWorkoutLogRow = Database['public']['Tables']['user_workout_logs']['Row'];
export type UserProgramRow = Database['public']['Tables']['user_programs']['Row'];
export type UserChallengeRow = Database['public']['Tables']['user_challenges']['Row'];
export type EquipmentInventoryRow = Database['public']['Tables']['equipment_inventory']['Row'];
export type EquipmentZoneRow = Database['public']['Tables']['equipment_zones']['Row'];
export type WarmupConfigRow = Database['public']['Tables']['warmup_config']['Row'];
export type GeneratedWodRow = Database['public']['Tables']['generated_wods']['Row'];
export type WorkoutSetRow = Database['public']['Tables']['workout_sets']['Row'];
