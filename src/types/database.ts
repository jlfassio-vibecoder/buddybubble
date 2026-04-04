/**
 * Application-level types aligned with `supabase/migrations`.
 * Regenerate with the Supabase CLI when the schema changes:
 * `supabase gen types typescript --linked > src/types/database.generated.ts`
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type WorkspaceCategory = 'business' | 'kids' | 'class';
export type MemberRole = 'admin' | 'member' | 'guest';
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
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
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
        };
        Insert: {
          id?: string;
          name: string;
          category_type: WorkspaceCategory;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['workspaces']['Insert']>;
      };
      workspace_members: {
        Row: {
          workspace_id: string;
          user_id: string;
          role: MemberRole;
        };
        Insert: {
          workspace_id: string;
          user_id: string;
          role: MemberRole;
        };
        Update: Partial<Database['public']['Tables']['workspace_members']['Insert']>;
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
      messages: {
        Row: {
          id: string;
          bubble_id: string;
          user_id: string;
          content: string;
          parent_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bubble_id: string;
          user_id: string;
          content?: string;
          parent_id?: string | null;
          created_at?: string;
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
          assigned_to: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bubble_id: string;
          title: string;
          description?: string | null;
          status?: string;
          position?: number;
          assigned_to?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>;
      };
    };
  };
}

export type BubbleRow = Database['public']['Tables']['bubbles']['Row'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type TaskRow = Database['public']['Tables']['tasks']['Row'];
