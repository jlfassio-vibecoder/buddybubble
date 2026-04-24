export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      agent_definitions: {
        Row: {
          auth_user_id: string;
          avatar_url: string;
          created_at: string;
          display_name: string;
          id: string;
          is_active: boolean;
          mention_handle: string;
          response_timeout_ms: number;
          slug: string;
        };
        Insert: {
          auth_user_id: string;
          avatar_url: string;
          created_at?: string;
          display_name: string;
          id?: string;
          is_active?: boolean;
          mention_handle: string;
          response_timeout_ms?: number;
          slug: string;
        };
        Update: {
          auth_user_id?: string;
          avatar_url?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          is_active?: boolean;
          mention_handle?: string;
          response_timeout_ms?: number;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_definitions_auth_user_id_fkey';
            columns: ['auth_user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      agent_message_runs: {
        Row: {
          agent_auth_user_id: string;
          created_at: string;
          created_task_id: string | null;
          reply_message_id: string | null;
          trigger_message_id: string;
        };
        Insert: {
          agent_auth_user_id: string;
          created_at?: string;
          created_task_id?: string | null;
          reply_message_id?: string | null;
          trigger_message_id: string;
        };
        Update: {
          agent_auth_user_id?: string;
          created_at?: string;
          created_task_id?: string | null;
          reply_message_id?: string | null;
          trigger_message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'agent_message_runs_agent_auth_user_id_fkey';
            columns: ['agent_auth_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_message_runs_created_task_id_fkey';
            columns: ['created_task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_message_runs_reply_message_id_fkey';
            columns: ['reply_message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'agent_message_runs_trigger_message_id_fkey';
            columns: ['trigger_message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
        ];
      };
      analytics_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          lead_id: string | null;
          metadata: Json;
          path: string | null;
          session_id: string | null;
          user_id: string | null;
          workspace_id: string | null;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          lead_id?: string | null;
          metadata?: Json;
          path?: string | null;
          session_id?: string | null;
          user_id?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          lead_id?: string | null;
          metadata?: Json;
          path?: string | null;
          session_id?: string | null;
          user_id?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'analytics_events_lead_id_fkey';
            columns: ['lead_id'];
            isOneToOne: false;
            referencedRelation: 'leads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'analytics_events_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      billing_funnel_events: {
        Row: {
          billing_attempt_id: string | null;
          client_session_id: string | null;
          created_at: string;
          environment: string;
          event_key: string;
          id: string;
          payload: Json;
          source: string;
          stripe_event_id: string | null;
          stripe_mode: string;
          user_id: string | null;
          workspace_id: string | null;
        };
        Insert: {
          billing_attempt_id?: string | null;
          client_session_id?: string | null;
          created_at?: string;
          environment: string;
          event_key: string;
          id?: string;
          payload?: Json;
          source: string;
          stripe_event_id?: string | null;
          stripe_mode: string;
          user_id?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          billing_attempt_id?: string | null;
          client_session_id?: string | null;
          created_at?: string;
          environment?: string;
          event_key?: string;
          id?: string;
          payload?: Json;
          source?: string;
          stripe_event_id?: string | null;
          stripe_mode?: string;
          user_id?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'billing_funnel_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'billing_funnel_events_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      board_columns: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          position: number;
          slug: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          position: number;
          slug: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          position?: number;
          slug?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'board_columns_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      bubble_agent_bindings: {
        Row: {
          agent_definition_id: string;
          bubble_id: string;
          created_at: string;
          enabled: boolean;
          id: string;
          sort_order: number;
        };
        Insert: {
          agent_definition_id: string;
          bubble_id: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          sort_order?: number;
        };
        Update: {
          agent_definition_id?: string;
          bubble_id?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'bubble_agent_bindings_agent_definition_id_fkey';
            columns: ['agent_definition_id'];
            isOneToOne: false;
            referencedRelation: 'agent_definitions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bubble_agent_bindings_bubble_id_fkey';
            columns: ['bubble_id'];
            isOneToOne: false;
            referencedRelation: 'bubbles';
            referencedColumns: ['id'];
          },
        ];
      };
      bubble_members: {
        Row: {
          bubble_id: string;
          created_at: string;
          id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          bubble_id: string;
          created_at?: string;
          id?: string;
          role?: string;
          user_id: string;
        };
        Update: {
          bubble_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bubble_members_bubble_id_fkey';
            columns: ['bubble_id'];
            isOneToOne: false;
            referencedRelation: 'bubbles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bubble_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      bubbles: {
        Row: {
          bubble_type: string;
          created_at: string;
          icon: string | null;
          id: string;
          is_private: boolean;
          metadata: Json;
          name: string;
          workspace_id: string;
        };
        Insert: {
          bubble_type?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_private?: boolean;
          metadata?: Json;
          name: string;
          workspace_id: string;
        };
        Update: {
          bubble_type?: string;
          created_at?: string;
          icon?: string | null;
          id?: string;
          is_private?: boolean;
          metadata?: Json;
          name?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bubbles_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      challenge_weeks: {
        Row: {
          challenge_id: string;
          content: Json | null;
          created_at: string | null;
          id: string;
          week_number: number;
        };
        Insert: {
          challenge_id: string;
          content?: Json | null;
          created_at?: string | null;
          id?: string;
          week_number: number;
        };
        Update: {
          challenge_id?: string;
          content?: Json | null;
          created_at?: string | null;
          id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'challenge_weeks_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'challenges';
            referencedColumns: ['id'];
          },
        ];
      };
      challenges: {
        Row: {
          author_id: string;
          chain_metadata: Json | null;
          config: Json | null;
          created_at: string | null;
          description: string | null;
          hero_image_url: string | null;
          id: string;
          section_images: Json | null;
          status: string;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          author_id: string;
          chain_metadata?: Json | null;
          config?: Json | null;
          created_at?: string | null;
          description?: string | null;
          hero_image_url?: string | null;
          id?: string;
          section_images?: Json | null;
          status?: string;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          author_id?: string;
          chain_metadata?: Json | null;
          config?: Json | null;
          created_at?: string | null;
          description?: string | null;
          hero_image_url?: string | null;
          id?: string;
          section_images?: Json | null;
          status?: string;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'challenges_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      class_enrollments: {
        Row: {
          enrolled_at: string;
          id: string;
          instance_id: string;
          status: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          enrolled_at?: string;
          id?: string;
          instance_id: string;
          status?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          enrolled_at?: string;
          id?: string;
          instance_id?: string;
          status?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'class_enrollments_instance_id_fkey';
            columns: ['instance_id'];
            isOneToOne: false;
            referencedRelation: 'class_instances';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'class_enrollments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'class_enrollments_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      class_instances: {
        Row: {
          capacity: number | null;
          created_at: string;
          id: string;
          instructor_notes: string | null;
          metadata: Json;
          offering_id: string;
          scheduled_at: string;
          status: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          capacity?: number | null;
          created_at?: string;
          id?: string;
          instructor_notes?: string | null;
          metadata?: Json;
          offering_id: string;
          scheduled_at: string;
          status?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          capacity?: number | null;
          created_at?: string;
          id?: string;
          instructor_notes?: string | null;
          metadata?: Json;
          offering_id?: string;
          scheduled_at?: string;
          status?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'class_instances_offering_id_fkey';
            columns: ['offering_id'];
            isOneToOne: false;
            referencedRelation: 'class_offerings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'class_instances_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      class_offerings: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          duration_min: number;
          id: string;
          location: string | null;
          metadata: Json;
          name: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_min?: number;
          id?: string;
          location?: string | null;
          metadata?: Json;
          name: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          duration_min?: number;
          id?: string;
          location?: string | null;
          metadata?: Json;
          name?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'class_offerings_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'class_offerings_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      equipment_inventory: {
        Row: {
          category: string;
          created_at: string | null;
          id: string;
          name: string;
        };
        Insert: {
          category: string;
          created_at?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          category?: string;
          created_at?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      equipment_zones: {
        Row: {
          biomechanical_constraints: string[] | null;
          category: string;
          created_at: string | null;
          description: string | null;
          equipment_ids: string[] | null;
          id: string;
          name: string;
        };
        Insert: {
          biomechanical_constraints?: string[] | null;
          category: string;
          created_at?: string | null;
          description?: string | null;
          equipment_ids?: string[] | null;
          id?: string;
          name: string;
        };
        Update: {
          biomechanical_constraints?: string[] | null;
          category?: string;
          created_at?: string | null;
          description?: string | null;
          equipment_ids?: string[] | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      exercise_dictionary: {
        Row: {
          biomechanics: Json;
          complexity_level: string | null;
          created_at: string;
          id: string;
          instructions: Json;
          kinetic_chain_type: string | null;
          media: Json;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          biomechanics?: Json;
          complexity_level?: string | null;
          created_at?: string;
          id?: string;
          instructions?: Json;
          kinetic_chain_type?: string | null;
          media?: Json;
          name: string;
          slug: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          biomechanics?: Json;
          complexity_level?: string | null;
          created_at?: string;
          id?: string;
          instructions?: Json;
          kinetic_chain_type?: string | null;
          media?: Json;
          name?: string;
          slug?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      fitness_profiles: {
        Row: {
          biometrics: Json;
          biometrics_is_public: boolean;
          created_at: string;
          equipment: string[];
          goals: string[];
          id: string;
          unit_system: string;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          biometrics?: Json;
          biometrics_is_public?: boolean;
          created_at?: string;
          equipment?: string[];
          goals?: string[];
          id?: string;
          unit_system?: string;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          biometrics?: Json;
          biometrics_is_public?: boolean;
          created_at?: string;
          equipment?: string[];
          goals?: string[];
          id?: string;
          unit_system?: string;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fitness_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fitness_profiles_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      generated_wods: {
        Row: {
          author_id: string | null;
          created_at: string | null;
          day: string | null;
          description: string | null;
          exercise_overrides: Json | null;
          genre: string | null;
          id: string;
          image: string | null;
          intensity: number;
          iteration: Json | null;
          level: string | null;
          name: string | null;
          parameters: Json | null;
          resolved_format: Json | null;
          rest_load: string | null;
          status: string;
          target_volume_minutes: number | null;
          title: string;
          updated_at: string | null;
          window_minutes: number | null;
          workout_detail: Json | null;
        };
        Insert: {
          author_id?: string | null;
          created_at?: string | null;
          day?: string | null;
          description?: string | null;
          exercise_overrides?: Json | null;
          genre?: string | null;
          id?: string;
          image?: string | null;
          intensity?: number;
          iteration?: Json | null;
          level?: string | null;
          name?: string | null;
          parameters?: Json | null;
          resolved_format?: Json | null;
          rest_load?: string | null;
          status?: string;
          target_volume_minutes?: number | null;
          title: string;
          updated_at?: string | null;
          window_minutes?: number | null;
          workout_detail?: Json | null;
        };
        Update: {
          author_id?: string | null;
          created_at?: string | null;
          day?: string | null;
          description?: string | null;
          exercise_overrides?: Json | null;
          genre?: string | null;
          id?: string;
          image?: string | null;
          intensity?: number;
          iteration?: Json | null;
          level?: string | null;
          name?: string | null;
          parameters?: Json | null;
          resolved_format?: Json | null;
          rest_load?: string | null;
          status?: string;
          target_volume_minutes?: number | null;
          title?: string;
          updated_at?: string | null;
          window_minutes?: number | null;
          workout_detail?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'generated_wods_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      invitation_join_requests: {
        Row: {
          created_at: string;
          id: string;
          invitation_id: string;
          resolved_at: string | null;
          status: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invitation_id: string;
          resolved_at?: string | null;
          status: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invitation_id?: string;
          resolved_at?: string | null;
          status?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitation_join_requests_invitation_id_fkey';
            columns: ['invitation_id'];
            isOneToOne: false;
            referencedRelation: 'invitations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitation_join_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitation_join_requests_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          invite_type: string;
          label: string | null;
          max_uses: number;
          revoked_at: string | null;
          role: string;
          target_identity: string | null;
          token: string;
          uses_count: number;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          expires_at: string;
          id?: string;
          invite_type: string;
          label?: string | null;
          max_uses?: number;
          revoked_at?: string | null;
          role?: string;
          target_identity?: string | null;
          token: string;
          uses_count?: number;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          invite_type?: string;
          label?: string | null;
          max_uses?: number;
          revoked_at?: string | null;
          role?: string;
          target_identity?: string | null;
          token?: string;
          uses_count?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      leads: {
        Row: {
          converted_at: string | null;
          email: string | null;
          first_seen_at: string;
          id: string;
          invite_token: string | null;
          last_seen_at: string;
          metadata: Json;
          source: string | null;
          user_id: string | null;
          utm_params: Json;
          workspace_id: string | null;
        };
        Insert: {
          converted_at?: string | null;
          email?: string | null;
          first_seen_at?: string;
          id?: string;
          invite_token?: string | null;
          last_seen_at?: string;
          metadata?: Json;
          source?: string | null;
          user_id?: string | null;
          utm_params?: Json;
          workspace_id?: string | null;
        };
        Update: {
          converted_at?: string | null;
          email?: string | null;
          first_seen_at?: string;
          id?: string;
          invite_token?: string | null;
          last_seen_at?: string;
          metadata?: Json;
          source?: string | null;
          user_id?: string | null;
          utm_params?: Json;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'leads_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      live_session_deck_items: {
        Row: {
          created_at: string;
          id: string;
          session_id: string;
          sort_order: number;
          task_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          session_id: string;
          sort_order?: number;
          task_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          session_id?: string;
          sort_order?: number;
          task_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'live_session_deck_items_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          attached_task_id: string | null;
          attachments: Json;
          bubble_id: string;
          content: string;
          created_at: string;
          id: string;
          metadata: Json;
          parent_id: string | null;
          target_task_id: string | null;
          user_id: string;
        };
        Insert: {
          attached_task_id?: string | null;
          attachments?: Json;
          bubble_id: string;
          content?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          parent_id?: string | null;
          target_task_id?: string | null;
          user_id: string;
        };
        Update: {
          attached_task_id?: string | null;
          attachments?: Json;
          bubble_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          parent_id?: string | null;
          target_task_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_attached_task_id_fkey';
            columns: ['attached_task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_bubble_id_fkey';
            columns: ['bubble_id'];
            isOneToOne: false;
            referencedRelation: 'bubbles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_target_task_id_fkey';
            columns: ['target_task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      program_weeks: {
        Row: {
          content: Json | null;
          created_at: string | null;
          id: string;
          program_id: string;
          week_number: number;
        };
        Insert: {
          content?: Json | null;
          created_at?: string | null;
          id?: string;
          program_id: string;
          week_number: number;
        };
        Update: {
          content?: Json | null;
          created_at?: string | null;
          id?: string;
          program_id?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'program_weeks_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      programs: {
        Row: {
          chain_metadata: Json | null;
          config: Json | null;
          created_at: string | null;
          description: string | null;
          difficulty: string | null;
          duration_weeks: number | null;
          id: string;
          is_public: boolean | null;
          status: string;
          tags: string[] | null;
          title: string;
          trainer_id: string;
          updated_at: string | null;
        };
        Insert: {
          chain_metadata?: Json | null;
          config?: Json | null;
          created_at?: string | null;
          description?: string | null;
          difficulty?: string | null;
          duration_weeks?: number | null;
          id?: string;
          is_public?: boolean | null;
          status?: string;
          tags?: string[] | null;
          title: string;
          trainer_id: string;
          updated_at?: string | null;
        };
        Update: {
          chain_metadata?: Json | null;
          config?: Json | null;
          created_at?: string | null;
          description?: string | null;
          difficulty?: string | null;
          duration_weeks?: number | null;
          id?: string;
          is_public?: boolean | null;
          status?: string;
          tags?: string[] | null;
          title?: string;
          trainer_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'programs_trainer_id_fkey';
            columns: ['trainer_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      storefront_sandbox_messages: {
        Row: {
          author_kind: string;
          body: string;
          channel_key: string;
          created_at: string;
          display_name: string | null;
          guest_session_id: string | null;
          id: string;
        };
        Insert: {
          author_kind: string;
          body: string;
          channel_key: string;
          created_at?: string;
          display_name?: string | null;
          guest_session_id?: string | null;
          id?: string;
        };
        Update: {
          author_kind?: string;
          body?: string;
          channel_key?: string;
          created_at?: string;
          display_name?: string | null;
          guest_session_id?: string | null;
          id?: string;
        };
        Relationships: [];
      };
      stripe_customers: {
        Row: {
          created_at: string;
          has_had_trial: boolean;
          stripe_customer_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          has_had_trial?: boolean;
          stripe_customer_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          has_had_trial?: boolean;
          stripe_customer_id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      task_activity_log: {
        Row: {
          action_type: string;
          created_at: string;
          id: string;
          payload: Json;
          task_id: string;
          user_id: string | null;
        };
        Insert: {
          action_type: string;
          created_at?: string;
          id?: string;
          payload?: Json;
          task_id: string;
          user_id?: string | null;
        };
        Update: {
          action_type?: string;
          created_at?: string;
          id?: string;
          payload?: Json;
          task_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'task_activity_log_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_activity_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_assignees: {
        Row: {
          assigned_at: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          assigned_at?: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          assigned_at?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_assignees_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_assignees_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_bubble_ups: {
        Row: {
          created_at: string;
          id: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_bubble_ups_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_bubble_ups_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_subtasks: {
        Row: {
          completed: boolean;
          created_at: string;
          id: string;
          position: number;
          task_id: string;
          title: string;
        };
        Insert: {
          completed?: boolean;
          created_at?: string;
          id?: string;
          position?: number;
          task_id: string;
          title: string;
        };
        Update: {
          completed?: boolean;
          created_at?: string;
          id?: string;
          position?: number;
          task_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_subtasks_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      tasks: {
        Row: {
          archived_at: string | null;
          attachments: Json;
          bubble_id: string;
          comment_count: number;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          item_type: string;
          last_task_comment_at: string | null;
          metadata: Json;
          position: number;
          priority: string;
          program_id: string | null;
          program_session_key: string | null;
          scheduled_on: string | null;
          scheduled_time: string | null;
          status: string;
          title: string;
          visibility: string;
        };
        Insert: {
          archived_at?: string | null;
          attachments?: Json;
          bubble_id: string;
          comment_count?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          item_type?: string;
          last_task_comment_at?: string | null;
          metadata?: Json;
          position?: number;
          priority?: string;
          program_id?: string | null;
          program_session_key?: string | null;
          scheduled_on?: string | null;
          scheduled_time?: string | null;
          status?: string;
          title: string;
          visibility?: string;
        };
        Update: {
          archived_at?: string | null;
          attachments?: Json;
          bubble_id?: string;
          comment_count?: number;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          item_type?: string;
          last_task_comment_at?: string | null;
          metadata?: Json;
          position?: number;
          priority?: string;
          program_id?: string | null;
          program_session_key?: string | null;
          scheduled_on?: string | null;
          scheduled_time?: string | null;
          status?: string;
          title?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tasks_bubble_id_fkey';
            columns: ['bubble_id'];
            isOneToOne: false;
            referencedRelation: 'bubbles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      user_challenges: {
        Row: {
          challenge_id: string;
          created_at: string | null;
          id: string;
          start_date: string | null;
          user_id: string;
        };
        Insert: {
          challenge_id: string;
          created_at?: string | null;
          id?: string;
          start_date?: string | null;
          user_id: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string | null;
          id?: string;
          start_date?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_challenges_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_challenges_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_programs: {
        Row: {
          created_at: string | null;
          id: string;
          program_id: string;
          purchased_at: string | null;
          source: string;
          start_date: string | null;
          status: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          program_id: string;
          purchased_at?: string | null;
          source?: string;
          start_date?: string | null;
          status?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          program_id?: string;
          purchased_at?: string | null;
          source?: string;
          start_date?: string | null;
          status?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_programs_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_programs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_task_views: {
        Row: {
          last_viewed_at: string;
          task_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          last_viewed_at?: string;
          task_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          last_viewed_at?: string;
          task_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_task_views_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_task_views_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_workout_logs: {
        Row: {
          created_at: string | null;
          date: string;
          duration_seconds: number;
          exercises: Json;
          id: string;
          program_id: string;
          user_id: string;
          week_id: string;
          workout_id: string;
        };
        Insert: {
          created_at?: string | null;
          date: string;
          duration_seconds?: number;
          exercises?: Json;
          id?: string;
          program_id: string;
          user_id: string;
          week_id: string;
          workout_id: string;
        };
        Update: {
          created_at?: string | null;
          date?: string;
          duration_seconds?: number;
          exercises?: Json;
          id?: string;
          program_id?: string;
          user_id?: string;
          week_id?: string;
          workout_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_workout_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          children_names: Json;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          is_admin: boolean;
          is_agent: boolean;
          purchased_index: number | null;
          role: string | null;
          timezone: string;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          children_names?: Json;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          is_admin?: boolean;
          is_agent?: boolean;
          purchased_index?: number | null;
          role?: string | null;
          timezone?: string;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          children_names?: Json;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          is_admin?: boolean;
          is_agent?: boolean;
          purchased_index?: number | null;
          role?: string | null;
          timezone?: string;
        };
        Relationships: [];
      };
      warmup_config: {
        Row: {
          duration_per_exercise: number;
          id: string;
          slots: Json;
          updated_at: string | null;
        };
        Insert: {
          duration_per_exercise?: number;
          id?: string;
          slots?: Json;
          updated_at?: string | null;
        };
        Update: {
          duration_per_exercise?: number;
          id?: string;
          slots?: Json;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      workout_exercise_logs: {
        Row: {
          created_at: string;
          exercise_name: string;
          id: string;
          reps: number | null;
          rpe: number | null;
          session_id: string;
          set_number: number;
          task_id: string;
          user_id: string;
          weight_lbs: number | null;
        };
        Insert: {
          created_at?: string;
          exercise_name: string;
          id?: string;
          reps?: number | null;
          rpe?: number | null;
          session_id: string;
          set_number: number;
          task_id: string;
          user_id: string;
          weight_lbs?: number | null;
        };
        Update: {
          created_at?: string;
          exercise_name?: string;
          id?: string;
          reps?: number | null;
          rpe?: number | null;
          session_id?: string;
          set_number?: number;
          task_id?: string;
          user_id?: string;
          weight_lbs?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_exercise_logs_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workout_exercise_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_logs: {
        Row: {
          created_at: string | null;
          date: string;
          effort: number;
          id: string;
          notes: string | null;
          rating: number;
          readiness_score: number | null;
          user_id: string;
          workout_id: string | null;
          workout_name: string;
        };
        Insert: {
          created_at?: string | null;
          date: string;
          effort: number;
          id?: string;
          notes?: string | null;
          rating: number;
          readiness_score?: number | null;
          user_id: string;
          workout_id?: string | null;
          workout_name: string;
        };
        Update: {
          created_at?: string | null;
          date?: string;
          effort?: number;
          id?: string;
          notes?: string | null;
          rating?: number;
          readiness_score?: number | null;
          user_id?: string;
          workout_id?: string | null;
          workout_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workout_sets: {
        Row: {
          author_id: string;
          chain_metadata: Json | null;
          config: Json | null;
          created_at: string | null;
          description: string | null;
          id: string;
          status: string;
          title: string;
          updated_at: string | null;
          workout_count: number;
          workouts: Json;
        };
        Insert: {
          author_id: string;
          chain_metadata?: Json | null;
          config?: Json | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          status?: string;
          title: string;
          updated_at?: string | null;
          workout_count?: number;
          workouts?: Json;
        };
        Update: {
          author_id?: string;
          chain_metadata?: Json | null;
          config?: Json | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          status?: string;
          title?: string;
          updated_at?: string | null;
          workout_count?: number;
          workouts?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'workout_sets_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workouts: {
        Row: {
          blocks: Json | null;
          created_at: string | null;
          description: string | null;
          difficulty_level: string | null;
          duration_minutes: number | null;
          id: string;
          program_id: string | null;
          scheduled_day: number | null;
          scheduled_week: number | null;
          status: string | null;
          title: string;
          trainer_id: string;
          updated_at: string | null;
        };
        Insert: {
          blocks?: Json | null;
          created_at?: string | null;
          description?: string | null;
          difficulty_level?: string | null;
          duration_minutes?: number | null;
          id?: string;
          program_id?: string | null;
          scheduled_day?: number | null;
          scheduled_week?: number | null;
          status?: string | null;
          title: string;
          trainer_id: string;
          updated_at?: string | null;
        };
        Update: {
          blocks?: Json | null;
          created_at?: string | null;
          description?: string | null;
          difficulty_level?: string | null;
          duration_minutes?: number | null;
          id?: string;
          program_id?: string | null;
          scheduled_day?: number | null;
          scheduled_week?: number | null;
          status?: string | null;
          title?: string;
          trainer_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workouts_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workouts_trainer_id_fkey';
            columns: ['trainer_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_member_notes: {
        Row: {
          body: string | null;
          subject_user_id: string;
          updated_at: string;
          updated_by: string | null;
          workspace_id: string;
        };
        Insert: {
          body?: string | null;
          subject_user_id: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id: string;
        };
        Update: {
          body?: string | null;
          subject_user_id?: string;
          updated_at?: string;
          updated_by?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_member_notes_subject_user_id_fkey';
            columns: ['subject_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_member_notes_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_member_notes_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          onboarding_status: string;
          role: string;
          show_email_to_workspace_members: boolean;
          trial_expires_at: string | null;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          onboarding_status?: string;
          role: string;
          show_email_to_workspace_members?: boolean;
          trial_expires_at?: string | null;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          onboarding_status?: string;
          role?: string;
          show_email_to_workspace_members?: boolean;
          trial_expires_at?: string | null;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_role_default_bubbles: {
        Row: {
          bubble_id: string;
          created_at: string;
          role: string;
          workspace_id: string;
        };
        Insert: {
          bubble_id: string;
          created_at?: string;
          role: string;
          workspace_id: string;
        };
        Update: {
          bubble_id?: string;
          created_at?: string;
          role?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_role_default_bubbles_bubble_id_fkey';
            columns: ['bubble_id'];
            isOneToOne: false;
            referencedRelation: 'bubbles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_role_default_bubbles_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_role_feature_flags: {
        Row: {
          created_at: string;
          feature_key: string;
          is_enabled: boolean;
          role: string;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          feature_key: string;
          is_enabled?: boolean;
          role: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          feature_key?: string;
          is_enabled?: boolean;
          role?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_role_feature_flags_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          id: string;
          owner_user_id: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_price_id: string | null;
          stripe_product_id: string | null;
          stripe_subscription_id: string | null;
          trial_end: string | null;
          trial_start: string | null;
          updated_at: string;
          workspace_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          owner_user_id: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          trial_start?: string | null;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          owner_user_id?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_price_id?: string | null;
          stripe_product_id?: string | null;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          trial_start?: string | null;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_subscriptions_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          calendar_timezone: string;
          category_type: string;
          created_at: string;
          created_by: string;
          custom_domain: string | null;
          icon_url: string | null;
          id: string;
          is_public: boolean;
          metadata: Json;
          name: string;
          public_branding: Json;
          public_slug: string | null;
        };
        Insert: {
          calendar_timezone?: string;
          category_type: string;
          created_at?: string;
          created_by: string;
          custom_domain?: string | null;
          icon_url?: string | null;
          id?: string;
          is_public?: boolean;
          metadata?: Json;
          name: string;
          public_branding?: Json;
          public_slug?: string | null;
        };
        Update: {
          calendar_timezone?: string;
          category_type?: string;
          created_at?: string;
          created_by?: string;
          custom_domain?: string | null;
          icon_url?: string | null;
          id?: string;
          is_public?: boolean;
          metadata?: Json;
          name?: string;
          public_branding?: Json;
          public_slug?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspaces_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: Json };
      agent_create_card_and_reply: {
        Args: {
          p_agent_auth_user_id: string;
          p_create_card?: boolean;
          p_invoker_user_id: string;
          p_reply_text: string;
          p_seed_task_comment_text?: string;
          p_task_description?: string;
          p_task_status?: string;
          p_task_title?: string;
          p_task_type?: string;
          p_thread_id: string;
          p_trigger_message_id: string;
        };
        Returns: Json;
      };
      agent_insert_coach_workout_draft_reply: {
        Args: {
          p_agent_auth_user_id: string;
          p_invoker_user_id: string;
          p_proposed_description?: string;
          p_proposed_metadata?: Json;
          p_proposed_title?: string;
          p_reply_text: string;
          p_target_task_id: string;
          p_thread_id: string;
          p_trigger_message_id: string;
        };
        Returns: Json;
      };
      agent_update_task_and_reply: {
        Args: {
          p_agent_auth_user_id: string;
          p_invoker_user_id: string;
          p_new_description?: string;
          p_new_title?: string;
          p_reply_text: string;
          p_target_task_id: string;
          p_thread_id: string;
          p_trigger_message_id: string;
        };
        Returns: Json;
      };
      apply_workout_draft: { Args: { p_message_id: string }; Returns: Json };
      approve_invitation_join_request: {
        Args: { p_join_request_id: string };
        Returns: Json;
      };
      assign_user_to_session_deck: {
        Args: { p_session_id: string; p_user_id: string };
        Returns: number;
      };
      buddy_create_onboarding_reply: {
        Args: {
          p_action_type: string;
          p_bubble_id: string;
          p_buddy_user_id: string;
          p_card_desc: string;
          p_card_title: string;
          p_parent_id: string;
          p_reply_content: string;
        };
        Returns: Json;
      };
      can_mutate_task_linked_rows: {
        Args: { _task_id: string };
        Returns: boolean;
      };
      can_view_bubble: { Args: { _bubble_id: string }; Returns: boolean };
      can_write_bubble: { Args: { _bubble_id: string }; Returns: boolean };
      can_write_workspace: { Args: { _workspace_id: string }; Returns: boolean };
      ensure_profile_for_uid: { Args: { _uid: string }; Returns: undefined };
      exercise_dictionary_lookup_by_names: {
        Args: { p_names: string[] };
        Returns: {
          biomechanics: Json;
          complexity_level: string | null;
          created_at: string;
          id: string;
          instructions: Json;
          kinetic_chain_type: string | null;
          media: Json;
          name: string;
          slug: string;
          status: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'exercise_dictionary';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_invite_preview: { Args: { p_token: string }; Returns: Json };
      get_task_bubble_id: { Args: { p_task_id: string }; Returns: string };
      get_workspace_subscription_status: {
        Args: { p_workspace_id: string };
        Returns: string;
      };
      is_workspace_admin: { Args: { _workspace_id: string }; Returns: boolean };
      is_workspace_guest: { Args: { _workspace_id: string }; Returns: boolean };
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean };
      peek_invitation: { Args: { p_token: string }; Returns: Json };
      reject_invitation_join_request: {
        Args: { p_join_request_id: string };
        Returns: Json;
      };
      set_workspace_member_show_email: {
        Args: { p_show: boolean; p_workspace_id: string };
        Returns: undefined;
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
      task_bubble_id: { Args: { _task_id: string }; Returns: string };
      task_comment_unread_counts: {
        Args: { p_task_ids: string[] };
        Returns: {
          latest_unread_message_id: string;
          task_id: string;
          unread_count: number;
        }[];
      };
      user_may_update_task_row: {
        Args: {
          _task: Database['public']['Tables']['tasks']['Row'];
          _uid: string;
        };
        Returns: boolean;
      };
      workspace_id_for_bubble: { Args: { _bubble_id: string }; Returns: string };
      workspace_requires_subscription: {
        Args: { p_workspace_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
