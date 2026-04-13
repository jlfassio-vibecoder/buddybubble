/**
 * Application-level types aligned with `supabase/migrations`.
 * Regenerate with the Supabase CLI when the schema changes:
 * `supabase gen types typescript --linked > src/types/database.generated.ts`
 */
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

/** Source channel that brought a lead to a workspace. */
export type LeadSource = 'qr' | 'link' | 'email' | 'sms' | 'direct';

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
          show_email_to_workspace_members: boolean;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role: MemberRole;
          created_at?: string;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          icon?: string | null;
          is_private?: boolean;
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
        };
        Insert: {
          id?: string;
          bubble_id: string;
          user_id: string;
          content?: string;
          parent_id?: string | null;
          created_at?: string;
          attachments?: Json;
        };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
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
          subtasks: Json;
          comments: Json;
          activity_log: Json;
          attachments: Json;
          item_type: string;
          metadata: Json;
          /** Members-only vs public storefront (when workspace is_public). */
          visibility: TaskVisibility;
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
          subtasks?: Json;
          comments?: Json;
          activity_log?: Json;
          attachments?: Json;
          item_type?: string;
          metadata?: Json;
          visibility?: TaskVisibility;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>;
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
          source: LeadSource | null;
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
          source?: LeadSource | null;
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
export type StorefrontSandboxMessageRow =
  Database['public']['Tables']['storefront_sandbox_messages']['Row'];
export type LeadRow = Database['public']['Tables']['leads']['Row'];
export type StripeCustomerRow = Database['public']['Tables']['stripe_customers']['Row'];
export type WorkspaceSubscriptionRow =
  Database['public']['Tables']['workspace_subscriptions']['Row'];
export type AnalyticsEventRow = Database['public']['Tables']['analytics_events']['Row'];
