/**
 * Application-level types aligned with `supabase/migrations`.
 * Regenerate with the Supabase CLI when the schema changes:
 * `supabase gen types typescript --linked > src/types/database.generated.ts`
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/** Template for a new BuddyBubble (`workspaces.category_type`). */
export type WorkspaceCategory = 'business' | 'kids' | 'class' | 'community';
export type MemberRole = 'admin' | 'member' | 'guest';
export type InviteType = 'qr' | 'link' | 'email' | 'sms';
export type InvitationJoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
/** Built-in Kanban slugs; `tasks.status` may also use workspace-specific slugs from `board_columns`. */
export type TaskStatus = 'todo' | 'in_progress' | 'done';

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
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          timezone?: string;
          created_at?: string;
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
        };
        Insert: {
          id?: string;
          name: string;
          category_type: WorkspaceCategory;
          created_by: string;
          created_at?: string;
          icon_url?: string | null;
          calendar_timezone?: string;
        };
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>;
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: MemberRole;
          created_at: string;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role: MemberRole;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>;
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
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          icon?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bubbles']['Insert']>;
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
          subtasks: Json;
          comments: Json;
          activity_log: Json;
          attachments: Json;
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
          subtasks?: Json;
          comments?: Json;
          activity_log?: Json;
          attachments?: Json;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>;
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
      reject_invitation_join_request: {
        Args: { p_join_request_id: string };
        Returns: Json;
      };
    };
  };
}

export type BubbleRow = Database['public']['Tables']['bubbles']['Row'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];
