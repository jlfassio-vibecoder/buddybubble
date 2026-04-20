/**
 * Application-level types aligned with `supabase/migrations`.
 * Regenerate with the Supabase CLI when the schema changes:
 * `supabase gen types typescript --linked > src/types/database.generated.ts`
 */
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

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Template for a new BuddyBubble (`workspaces.category_type`). */
export type WorkspaceCategory = 'business' | 'kids' | 'class' | 'community' | 'fitness';
export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';
export type BubbleMemberRole = 'editor' | 'viewer';
export type InviteType = 'qr' | 'link' | 'email' | 'sms';
export type InvitationJoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
/** Built-in Kanban slugs; `tasks.status` may also use workspace-specific slugs from `board_columns`. */
export type TaskStatus = 'todo' | 'in_progress' | 'done';

/** Polymorphic kind for `public.tasks` (single-table Kanban + calendar). */
export type ItemType =
  | 'task'
  | 'event'
  | 'experience'
  | 'idea'
  | 'memory'
  | 'workout'
  | 'workout_log'
  | 'program';

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

const ITEM_TYPE_SET = new Set<string>([
  'task',
  'event',
  'experience',
  'idea',
  'memory',
  'workout',
  'workout_log',
  'program',
]);

/** Safe default when `item_type` is missing (stale client) or invalid. */
export function normalizeItemType(value: unknown): ItemType {
  if (typeof value === 'string' && ITEM_TYPE_SET.has(value)) {
    return value as ItemType;
  }
  return 'task';
}

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          avatar_url: string | null;
          /** IANA timezone for the user (display and seeding new workspaces). */
          timezone?: string | null;
          /** Optional self-description shown to workspace peers. */
          bio: string | null;
          /** Family/children names for Kids and Community workspace caregivers. Shape: string[]. */
          children_names: string[];
          created_at: string;
          /** When true, the user can access founder-only routes (/admin/*). */
          is_admin: boolean;
          /** Bubble Agent service identity; paired with `agent_definitions.auth_user_id`. */
          is_agent: boolean;
          /**
           * Trainer-hub global role (`20260619120000_trainer_hub_schema_and_rls`): client | trainer | admin.
           * Distinct from `workspace_members.role`.
           */
          role: string | null;
          /** Trainer Spoke / hub storefront program ordering (`20260620100000_users_purchased_index`). */
          purchased_index: number | null;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          bio?: string | null;
          children_names?: string[];
          created_at?: string;
          is_admin?: boolean;
          is_agent?: boolean;
          role?: string | null;
          purchased_index?: number | null;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      workspaces: {
        Row: {
          id: string;
          name: string;
          category_type: WorkspaceCategory;
          created_by: string;
          created_at: string;
          icon_url: string | null;
          /** IANA timezone for workspace calendar "today" (task automation). */
          calendar_timezone: string;
          /** Public storefront path segment; unique when non-null. */
          public_slug: string | null;
          /** Custom hostname for storefront; unique when non-null. */
          custom_domain: string | null;
          /** When true, anon may SELECT this workspace and eligible tasks (RLS). */
          is_public: boolean;
          /** Public branding JSON (logo, hero, colors, etc.). */
          public_branding: Json;
        };
        Insert: {
          id?: string;
          name: string;
          category_type: WorkspaceCategory;
          created_by: string;
          created_at?: string;
          icon_url?: string | null;
          calendar_timezone?: string;
          public_slug?: string | null;
          custom_domain?: string | null;
          is_public?: boolean;
          public_branding?: Json;
        };
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>;
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: MemberRole;
          created_at: string;
          trial_expires_at: string | null;
          onboarding_status: WorkspaceMemberOnboardingStatus;
          show_email_to_workspace_members: boolean;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role: MemberRole;
          created_at?: string;
          trial_expires_at?: string | null;
          onboarding_status?: WorkspaceMemberOnboardingStatus;
          show_email_to_workspace_members?: boolean;
        };
        Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>;
      };
      workspace_member_notes: {
        Row: {
          workspace_id: string;
          subject_user_id: string;
          body: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          workspace_id: string;
          subject_user_id: string;
          body?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workspace_member_notes']['Insert']>;
      };
      invitations: {
        Row: {
          id: string;
          workspace_id: string;
          created_by: string;
          token: string;
          invite_type: InviteType;
          target_identity: string | null;
          label: string | null;
          max_uses: number;
          uses_count: number;
          expires_at: string;
          revoked_at: string | null;
          created_at: string;
          /** Role granted to the invitee on join. Cannot be 'owner'. */
          role: Exclude<MemberRole, 'owner'>;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          created_by: string;
          token: string;
          invite_type: InviteType;
          target_identity?: string | null;
          label?: string | null;
          max_uses?: number;
          uses_count?: number;
          expires_at: string;
          revoked_at?: string | null;
          created_at?: string;
          role?: Exclude<MemberRole, 'owner'>;
        };
        Update: Partial<Database['public']['Tables']['invitations']['Insert']>;
      };
      invitation_join_requests: {
        Row: {
          id: string;
          invitation_id: string;
          workspace_id: string;
          user_id: string;
          status: InvitationJoinRequestStatus;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          invitation_id: string;
          workspace_id: string;
          user_id: string;
          status: InvitationJoinRequestStatus;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['invitation_join_requests']['Insert']>;
      };
      bubbles: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          icon: string | null;
          /** When true, only owners/admins and explicit bubble_members can see this bubble. */
          is_private: boolean;
          bubble_type: BubbleType;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          icon?: string | null;
          is_private?: boolean;
          bubble_type?: BubbleType;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bubbles']['Insert']>;
      };
      bubble_members: {
        Row: {
          id: string;
          bubble_id: string;
          user_id: string;
          /** editor: can create/edit tasks + message. viewer: read tasks + message. */
          role: BubbleMemberRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          bubble_id: string;
          user_id: string;
          role?: BubbleMemberRole;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bubble_members']['Insert']>;
      };
      board_columns: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          slug: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          slug: string;
          position: number;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['board_columns']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          bubble_id: string;
          user_id: string;
          content: string;
          parent_id: string | null;
          created_at: string;
          attachments: Json;
          /** Optional Kanban card shown as an embed in chat (`20260518130000_messages_attached_task_id`). */
          attached_task_id: string | null;
          /** Optional task anchor for unified task comments (`20260416000000_normalize_task_collections_and_unified_chat`). */
          target_task_id: string | null;
          /** App JSON e.g. coach draft proposals (`20260623120000_coach_workout_draft_messages_metadata`). */
          metadata: Json;
        };
        Insert: {
          id?: string;
          bubble_id: string;
          user_id: string;
          content?: string;
          parent_id?: string | null;
          created_at?: string;
          attachments?: Json;
          attached_task_id?: string | null;
          target_task_id?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      task_bubble_ups: {
        Row: {
          id: string;
          task_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['task_bubble_ups']['Insert']>;
      };
      task_subtasks: {
        Row: {
          id: string;
          task_id: string;
          title: string;
          completed: boolean;
          created_at: string;
          position: number;
        };
        Insert: {
          id?: string;
          task_id: string;
          title: string;
          completed?: boolean;
          created_at?: string;
          position?: number;
        };
        Update: Partial<Database['public']['Tables']['task_subtasks']['Insert']>;
      };
      task_activity_log: {
        Row: {
          id: string;
          task_id: string;
          user_id: string | null;
          action_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          user_id?: string | null;
          action_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['task_activity_log']['Insert']>;
      };
      tasks: {
        Row: {
          id: string;
          bubble_id: string;
          title: string;
          description: string | null;
          status: string;
          position: number;
          priority: string;
          assigned_to: string | null;
          created_at: string;
          /** Calendar day in workspace timezone (YYYY-MM-DD). */
          scheduled_on: string | null;
          /** Local time on scheduled_on in workspace calendar_timezone; null = all-day. */
          scheduled_time: string | null;
          /** When set, task is archived and hidden from active Kanban/calendar lists. */
          archived_at: string | null;
          /** Parent program task id when this row belongs to a program (workout / workout_log). */
          program_id: string | null;
          /** Session key within the program (idempotent upserts). */
          program_session_key: string | null;
          attachments: Json;
          item_type: string;
          metadata: Json;
          /** Members-only vs public storefront (when workspace is_public). */
          visibility: TaskVisibility;
          /** Task-scoped `messages` count (`target_task_id`); maintained by trigger (`20260526120000_task_comment_counts_and_views`). */
          comment_count: number;
          /** Latest task-scoped message time; maintained by trigger. */
          last_task_comment_at: string | null;
        };
        Insert: {
          id?: string;
          bubble_id: string;
          title: string;
          description?: string | null;
          status?: string;
          position?: number;
          priority?: string;
          assigned_to?: string | null;
          created_at?: string;
          scheduled_on?: string | null;
          scheduled_time?: string | null;
          archived_at?: string | null;
          program_id?: string | null;
          program_session_key?: string | null;
          attachments?: Json;
          item_type?: string;
          metadata?: Json;
          visibility?: TaskVisibility;
          comment_count?: number;
          last_task_comment_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>;
      };
      user_task_views: {
        Row: {
          user_id: string;
          task_id: string;
          last_viewed_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          task_id: string;
          last_viewed_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_task_views']['Insert']>;
      };
      fitness_profiles: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          goals: string[];
          equipment: string[];
          unit_system: UnitSystem;
          biometrics: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          goals?: string[];
          equipment?: string[];
          unit_system?: UnitSystem;
          biometrics?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['fitness_profiles']['Insert']>;
      };
      class_offerings: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          description: string | null;
          duration_min: number;
          location: string | null;
          metadata: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          description?: string | null;
          duration_min?: number;
          location?: string | null;
          metadata?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['class_offerings']['Insert']>;
      };
      class_instances: {
        Row: {
          id: string;
          offering_id: string;
          workspace_id: string;
          scheduled_at: string;
          capacity: number | null;
          status: ClassInstanceStatus;
          instructor_notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          offering_id: string;
          workspace_id: string;
          scheduled_at: string;
          capacity?: number | null;
          status?: ClassInstanceStatus;
          instructor_notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['class_instances']['Insert']>;
      };
      class_enrollments: {
        Row: {
          id: string;
          instance_id: string;
          workspace_id: string;
          user_id: string;
          status: ClassEnrollmentStatus;
          enrolled_at: string;
        };
        Insert: {
          id?: string;
          instance_id: string;
          workspace_id: string;
          user_id: string;
          status?: ClassEnrollmentStatus;
          enrolled_at?: string;
        };
        Update: Partial<Database['public']['Tables']['class_enrollments']['Insert']>;
      };
      storefront_sandbox_messages: {
        Row: {
          id: string;
          created_at: string;
          channel_key: string;
          author_kind: string;
          guest_session_id: string | null;
          display_name: string | null;
          body: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          channel_key: string;
          author_kind: string;
          guest_session_id?: string | null;
          display_name?: string | null;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['storefront_sandbox_messages']['Insert']>;
      };
      /** Anonymous/semi-anonymous visitors who arrived via an invite link. */
      leads: {
        Row: {
          id: string;
          workspace_id: string | null;
          invite_token: string | null;
          source: LeadRowSource | null;
          email: string | null;
          utm_params: Json;
          first_seen_at: string;
          last_seen_at: string;
          /** Set when the lead starts a trial — null means unconverted. */
          converted_at: string | null;
          /** Linked once the visitor authenticates. */
          user_id: string | null;
          metadata: Json;
        };
        Insert: {
          id?: string;
          workspace_id?: string | null;
          invite_token?: string | null;
          source?: LeadRowSource | null;
          email?: string | null;
          utm_params?: Json;
          first_seen_at?: string;
          last_seen_at?: string;
          converted_at?: string | null;
          user_id?: string | null;
          metadata?: Json;
        };
        Update: Partial<Database['public']['Tables']['leads']['Insert']>;
      };
      /** Checkout funnel + billing diagnostics; written from Next API (service role). */
      billing_funnel_events: {
        Row: {
          id: string;
          created_at: string;
          billing_attempt_id: string | null;
          workspace_id: string | null;
          user_id: string | null;
          environment: string;
          stripe_mode: string;
          source: string;
          event_key: string;
          payload: Json;
          client_session_id: string | null;
          stripe_event_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          billing_attempt_id?: string | null;
          workspace_id?: string | null;
          user_id?: string | null;
          environment: string;
          stripe_mode: string;
          source: string;
          event_key: string;
          payload?: Json;
          client_session_id?: string | null;
          stripe_event_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['billing_funnel_events']['Insert']>;
      };
      /** Maps one Stripe Customer per auth user. Enforces one-trial-per-person. */
      stripe_customers: {
        Row: {
          user_id: string;
          stripe_customer_id: string;
          /** True once a trial has ever been started on any workspace. */
          has_had_trial: boolean;
          created_at: string;
        };
        Insert: {
          user_id: string;
          stripe_customer_id: string;
          has_had_trial?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['stripe_customers']['Insert']>;
      };
      /** Stripe subscription state for business/fitness workspaces. */
      workspace_subscriptions: {
        Row: {
          id: string;
          workspace_id: string;
          owner_user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          stripe_product_id: string | null;
          status: SubscriptionStatus;
          trial_start: string | null;
          trial_end: string | null;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          owner_user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          status?: SubscriptionStatus;
          trial_start?: string | null;
          trial_end?: string | null;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspace_subscriptions']['Insert']>;
      };
      analytics_events: {
        Row: {
          id: string;
          event_type: string;
          workspace_id: string | null;
          user_id: string | null;
          lead_id: string | null;
          session_id: string | null;
          path: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          event_type: string;
          workspace_id?: string | null;
          user_id?: string | null;
          lead_id?: string | null;
          session_id?: string | null;
          path?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['analytics_events']['Insert']>;
      };
      /** Canonical exercise catalog (SEO slugs, RAG); public SELECT, service_role writes. */
      exercise_dictionary: {
        Row: {
          id: string;
          slug: string;
          name: string;
          complexity_level: string | null;
          kinetic_chain_type: string | null;
          status: string;
          biomechanics: Json;
          instructions: Json;
          media: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          complexity_level?: string | null;
          kinetic_chain_type?: string | null;
          status?: string;
          biomechanics?: Json;
          instructions?: Json;
          media?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          complexity_level?: string | null;
          kinetic_chain_type?: string | null;
          status?: string;
          biomechanics?: Json;
          instructions?: Json;
          media?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      /** Hub: week bucket for a challenge (`20260619120000_trainer_hub_schema_and_rls`). */
      challenge_weeks: {
        Row: {
          id: string;
          challenge_id: string;
          week_number: number;
          content: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          challenge_id: string;
          week_number: number;
          content?: Json | null;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['challenge_weeks']['Insert']>;
      };
      /** Hub: trainer-authored challenge template. */
      challenges: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          author_id: string;
          status: string;
          config: Json | null;
          chain_metadata: Json | null;
          hero_image_url: string | null;
          section_images: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          author_id: string;
          status?: string;
          config?: Json | null;
          chain_metadata?: Json | null;
          hero_image_url?: string | null;
          section_images?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['challenges']['Insert']>;
      };
      /** Hub: global equipment catalog (RLS: authenticated read, hub admin write). */
      equipment_inventory: {
        Row: {
          id: string;
          name: string;
          category: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['equipment_inventory']['Insert']>;
      };
      /** Hub: modality / zone presets with equipment id lists. */
      equipment_zones: {
        Row: {
          id: string;
          name: string;
          category: string;
          description: string | null;
          biomechanical_constraints: string[] | null;
          equipment_ids: string[] | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          description?: string | null;
          biomechanical_constraints?: string[] | null;
          equipment_ids?: string[] | null;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['equipment_zones']['Insert']>;
      };
      /** Hub: AI / editor WOD drafts (`generated_wods`). */
      generated_wods: {
        Row: {
          id: string;
          title: string;
          level: string | null;
          workout_detail: Json | null;
          author_id: string | null;
          created_at: string | null;
          updated_at: string | null;
          status: string;
          name: string | null;
          genre: string | null;
          image: string | null;
          day: string | null;
          description: string | null;
          intensity: number;
          exercise_overrides: Json | null;
          iteration: Json | null;
          parameters: Json | null;
          resolved_format: Json | null;
          target_volume_minutes: number | null;
          window_minutes: number | null;
          rest_load: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          level?: string | null;
          workout_detail?: Json | null;
          author_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
          status?: string;
          name?: string | null;
          genre?: string | null;
          image?: string | null;
          day?: string | null;
          description?: string | null;
          intensity?: number;
          exercise_overrides?: Json | null;
          iteration?: Json | null;
          parameters?: Json | null;
          resolved_format?: Json | null;
          target_volume_minutes?: number | null;
          window_minutes?: number | null;
          rest_load?: string | null;
        };
        Update: Partial<Database['public']['Tables']['generated_wods']['Insert']>;
      };
      /** Hub: week slice for a program. */
      program_weeks: {
        Row: {
          id: string;
          program_id: string;
          week_number: number;
          content: Json | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          program_id: string;
          week_number: number;
          content?: Json | null;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['program_weeks']['Insert']>;
      };
      /** Hub: trainer program template. */
      programs: {
        Row: {
          id: string;
          trainer_id: string;
          title: string;
          description: string | null;
          difficulty: string | null;
          duration_weeks: number | null;
          tags: string[] | null;
          status: string;
          is_public: boolean | null;
          config: Json | null;
          chain_metadata: Json | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          trainer_id: string;
          title: string;
          description?: string | null;
          difficulty?: string | null;
          duration_weeks?: number | null;
          tags?: string[] | null;
          status?: string;
          is_public?: boolean | null;
          config?: Json | null;
          chain_metadata?: Json | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['programs']['Insert']>;
      };
      /** Hub: user enrollment in a challenge. */
      user_challenges: {
        Row: {
          id: string;
          user_id: string;
          challenge_id: string;
          start_date: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          challenge_id: string;
          start_date?: string | null;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['user_challenges']['Insert']>;
      };
      /** Hub: purchased / assigned program instance. */
      user_programs: {
        Row: {
          id: string;
          user_id: string;
          program_id: string;
          start_date: string | null;
          purchased_at: string | null;
          status: string | null;
          source: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          program_id: string;
          start_date?: string | null;
          purchased_at?: string | null;
          status?: string | null;
          source?: string;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['user_programs']['Insert']>;
      };
      /** Hub: per-session completion log (program/week/workout ids as text keys). */
      user_workout_logs: {
        Row: {
          id: string;
          user_id: string;
          program_id: string;
          week_id: string;
          workout_id: string;
          date: string;
          duration_seconds: number;
          exercises: Json;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          program_id: string;
          week_id: string;
          workout_id: string;
          date: string;
          duration_seconds?: number;
          exercises?: Json;
          created_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['user_workout_logs']['Insert']>;
      };
      /** Hub: singleton-ish warmup slot config (`id` default `default`). */
      warmup_config: {
        Row: {
          id: string;
          slots: Json;
          duration_per_exercise: number;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          slots?: Json;
          duration_per_exercise?: number;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['warmup_config']['Insert']>;
      };
      /** Hub: subjective session log (effort / rating / readiness). */
      workout_logs: {
        Row: {
          id: string;
          user_id: string;
          workout_id: string | null;
          workout_name: string;
          date: string;
          effort: number;
          rating: number;
          notes: string | null;
          created_at: string | null;
          readiness_score: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          workout_id?: string | null;
          workout_name: string;
          date: string;
          effort: number;
          rating: number;
          notes?: string | null;
          created_at?: string | null;
          readiness_score?: number | null;
        };
        Update: Partial<Database['public']['Tables']['workout_logs']['Insert']>;
      };
      /** Hub: published workout set (multi-session JSON). */
      workout_sets: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          author_id: string;
          status: string;
          config: Json | null;
          chain_metadata: Json | null;
          workouts: Json;
          workout_count: number;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          author_id: string;
          status?: string;
          config?: Json | null;
          chain_metadata?: Json | null;
          workouts?: Json;
          workout_count?: number;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workout_sets']['Insert']>;
      };
      /** Hub: workout template row (optional `program_id`). */
      workouts: {
        Row: {
          id: string;
          program_id: string | null;
          trainer_id: string;
          title: string;
          description: string | null;
          duration_minutes: number | null;
          difficulty_level: string | null;
          blocks: Json | null;
          status: string | null;
          scheduled_week: number | null;
          scheduled_day: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          program_id?: string | null;
          trainer_id: string;
          title: string;
          description?: string | null;
          duration_minutes?: number | null;
          difficulty_level?: string | null;
          blocks?: Json | null;
          status?: string | null;
          scheduled_week?: number | null;
          scheduled_day?: number | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['workouts']['Insert']>;
      };
      agent_definitions: {
        Row: {
          id: string;
          slug: string;
          mention_handle: string;
          display_name: string;
          auth_user_id: string;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          mention_handle: string;
          display_name: string;
          auth_user_id: string;
          avatar_url?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['agent_definitions']['Insert']>;
      };
      /** Webhook idempotency for `agent_create_card_and_reply` (one row per trigger + agent). */
      agent_message_runs: {
        Row: {
          trigger_message_id: string;
          agent_auth_user_id: string;
          created_task_id: string | null;
          reply_message_id: string | null;
          created_at: string;
        };
        Insert: {
          trigger_message_id: string;
          agent_auth_user_id: string;
          created_task_id?: string | null;
          reply_message_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['agent_message_runs']['Insert']>;
      };
      bubble_agent_bindings: {
        Row: {
          id: string;
          bubble_id: string;
          agent_definition_id: string;
          sort_order: number;
          enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          bubble_id: string;
          agent_definition_id: string;
          sort_order?: number;
          enabled?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bubble_agent_bindings']['Insert']>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: {
        Args: { p_token: string };
        Returns: Json;
      };
      approve_invitation_join_request: {
        Args: { p_join_request_id: string };
        Returns: Json;
      };
      peek_invitation: {
        Args: { p_token: string };
        Returns: Json;
      };
      get_invite_preview: {
        Args: { p_token: string };
        Returns: Json;
      };
      set_workspace_member_show_email: {
        Args: { p_workspace_id: string; p_show: boolean };
        Returns: undefined;
      };
      reject_invitation_join_request: {
        Args: { p_join_request_id: string };
        Returns: Json;
      };
      get_workspace_subscription_status: {
        Args: { p_workspace_id: string };
        /** Returns SubscriptionStatus or 'no_subscription'. */
        Returns: string;
      };
      workspace_requires_subscription: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
      can_mutate_task_linked_rows: {
        Args: { _task_id: string };
        Returns: boolean;
      };
      can_view_bubble: {
        Args: { _bubble_id: string };
        Returns: boolean;
      };
      can_write_bubble: {
        Args: { _bubble_id: string };
        Returns: boolean;
      };
      can_write_workspace: {
        Args: { _workspace_id: string };
        Returns: boolean;
      };
      ensure_profile_for_uid: {
        Args: { _uid: string };
        Returns: undefined;
      };
      is_workspace_admin: {
        Args: { _workspace_id: string };
        Returns: boolean;
      };
      is_workspace_guest: {
        Args: { _workspace_id: string };
        Returns: boolean;
      };
      is_workspace_member: {
        Args: { _workspace_id: string };
        Returns: boolean;
      };
      storage_message_attachment_path_deletable: {
        Args: { _bucket_id: string; _name: string };
        Returns: boolean;
      };
      storage_message_attachment_path_readable: {
        Args: { _bucket_id: string; _name: string };
        Returns: boolean;
      };
      storage_message_attachment_path_writable: {
        Args: { _bucket_id: string; _name: string };
        Returns: boolean;
      };
      storage_task_attachment_path_readable: {
        Args: { _bucket_id: string; _name: string };
        Returns: boolean;
      };
      storage_task_attachment_path_writable: {
        Args: { _bucket_id: string; _name: string };
        Returns: boolean;
      };
      task_bubble_id: {
        Args: { _task_id: string };
        Returns: string;
      };
      workspace_id_for_bubble: {
        Args: { _bubble_id: string };
        Returns: string;
      };
      task_comment_unread_counts: {
        Args: { p_task_ids: string[] };
        Returns: {
          task_id: string;
          unread_count: number;
          latest_unread_message_id: string | null;
        }[];
      };
      agent_create_card_and_reply: {
        Args: {
          p_trigger_message_id: string;
          /** Slack thread root for `messages.parent_id` on the agent reply. */
          p_thread_id: string;
          p_agent_auth_user_id: string;
          p_invoker_user_id: string;
          p_reply_text: string;
          p_create_card: boolean;
          p_task_title?: string;
          p_task_description?: string | null;
          /** Maps to `tasks.item_type` (e.g. `workout`, `task`, `program`). */
          p_task_type?: string;
          p_task_status?: string;
          /** When set with a new task, inserts an agent `messages` row scoped to that task (`target_task_id`). */
          p_seed_task_comment_text?: string | null;
        };
        Returns: Json;
      };
      /** Coach edits an existing task in the bubble + agent thread reply; idempotent per trigger + agent. */
      agent_update_task_and_reply: {
        Args: {
          p_trigger_message_id: string;
          p_thread_id: string;
          p_agent_auth_user_id: string;
          p_invoker_user_id: string;
          p_target_task_id: string;
          p_reply_text: string;
          p_new_title?: string | null;
          p_new_description?: string | null;
        };
        Returns: Json;
      };
      /** Agent inserts a thread reply with `messages.metadata.coach_draft`; does not mutate tasks. service_role only. */
      agent_insert_coach_workout_draft_reply: {
        Args: {
          p_trigger_message_id: string;
          p_thread_id: string;
          p_agent_auth_user_id: string;
          p_invoker_user_id: string;
          p_target_task_id: string;
          p_reply_text: string;
          p_proposed_title?: string | null;
          p_proposed_description?: string | null;
          p_proposed_metadata?: Json;
        };
        Returns: Json;
      };
      /** Merge coach draft into tasks and mark message draft accepted. */
      apply_workout_draft: {
        Args: { p_message_id: string };
        Returns: Json;
      };
      /** Batch name match: lower(trim); prefers published, then newest updated_at. Row[] at runtime. */
      exercise_dictionary_lookup_by_names: {
        Args: { p_names: string[] };
        Returns: {
          id: string;
          slug: string;
          name: string;
          complexity_level: string | null;
          kinetic_chain_type: string | null;
          status: string;
          biomechanics: Json;
          instructions: Json;
          media: Json;
          created_at: string;
          updated_at: string;
        }[];
      };
    };
  };
}

export type FitnessProfileRow = Database['public']['Tables']['fitness_profiles']['Row'];
export type ClassOfferingRow = Database['public']['Tables']['class_offerings']['Row'];
export type ClassInstanceRow = Database['public']['Tables']['class_instances']['Row'];
export type ClassEnrollmentRow = Database['public']['Tables']['class_enrollments']['Row'];
export type BubbleRow = Database['public']['Tables']['bubbles']['Row'];
export type BubbleMemberRow = Database['public']['Tables']['bubble_members']['Row'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];

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
