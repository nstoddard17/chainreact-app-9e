export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_api_keys: {
        Row: {
          account_id: string
          created_at: string
          created_by_user_id: string | null
          expires_at: string | null
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes: string[]
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_api_keys_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_billing: {
        Row: {
          account_id: string
          ai_credits_limit: number
          ai_credits_period_started_at: string
          ai_credits_reserved: number
          ai_credits_used: number
          billing_mode: string
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          internal_reason: string | null
          internal_set_at: string | null
          internal_set_by_user_id: string | null
          period_started_at: string
          plan: string
          plan_status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tasks_limit: number
          tasks_reserved: number
          tasks_used: number
          trial_consumed_at: string | null
          trial_ends_at: string | null
          trial_origin_plan: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          ai_credits_limit?: number
          ai_credits_period_started_at?: string
          ai_credits_reserved?: number
          ai_credits_used?: number
          billing_mode?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          internal_reason?: string | null
          internal_set_at?: string | null
          internal_set_by_user_id?: string | null
          period_started_at?: string
          plan?: string
          plan_status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tasks_limit?: number
          tasks_reserved?: number
          tasks_used?: number
          trial_consumed_at?: string | null
          trial_ends_at?: string | null
          trial_origin_plan?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          ai_credits_limit?: number
          ai_credits_period_started_at?: string
          ai_credits_reserved?: number
          ai_credits_used?: number
          billing_mode?: string
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          internal_reason?: string | null
          internal_set_at?: string | null
          internal_set_by_user_id?: string | null
          period_started_at?: string
          plan?: string
          plan_status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tasks_limit?: number
          tasks_reserved?: number
          tasks_used?: number
          trial_consumed_at?: string | null
          trial_ends_at?: string | null
          trial_origin_plan?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_billing_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletions: {
        Row: {
          account_id: string
          cancelled_at: string | null
          created_at: string
          id: string
          owner_user_id: string
          purge_after: string
          purge_counts: Json | null
          purged_at: string | null
          requested_at: string
          requested_by_user_id: string | null
          status: string
        }
        Insert: {
          account_id: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          owner_user_id: string
          purge_after: string
          purge_counts?: Json | null
          purged_at?: string | null
          requested_at?: string
          requested_by_user_id?: string | null
          status?: string
        }
        Update: {
          account_id?: string
          cancelled_at?: string | null
          created_at?: string
          id?: string
          owner_user_id?: string
          purge_after?: string
          purge_counts?: Json | null
          purged_at?: string | null
          requested_at?: string
          requested_by_user_id?: string | null
          status?: string
        }
        Relationships: []
      }
      account_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          account_id: string
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invited_by_user_id: string | null
          revoked_at: string | null
          role: string
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          account_id: string
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          invited_by_user_id?: string | null
          revoked_at?: string | null
          role: string
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          account_id?: string
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          invited_by_user_id?: string | null
          revoked_at?: string | null
          role?: string
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_invitations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_machine_credentials: {
        Row: {
          account_id: string
          cached_access_token_encrypted: string | null
          cached_token_expires_at: string | null
          cert_fingerprint256: string
          cert_not_after: string
          cert_pem_encrypted: string
          cert_subject: string | null
          client_id_encrypted: string
          client_secret_encrypted: string
          connected_by_user_id: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          key_pem_encrypted: string
          label: string | null
          metadata: Json
          provider: string
          rotated_at: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          cached_access_token_encrypted?: string | null
          cached_token_expires_at?: string | null
          cert_fingerprint256: string
          cert_not_after: string
          cert_pem_encrypted: string
          cert_subject?: string | null
          client_id_encrypted: string
          client_secret_encrypted: string
          connected_by_user_id?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          key_pem_encrypted: string
          label?: string | null
          metadata?: Json
          provider: string
          rotated_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          cached_access_token_encrypted?: string | null
          cached_token_expires_at?: string | null
          cert_fingerprint256?: string
          cert_not_after?: string
          cert_pem_encrypted?: string
          cert_subject?: string | null
          client_id_encrypted?: string
          client_secret_encrypted?: string
          connected_by_user_id?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          key_pem_encrypted?: string
          label?: string | null
          metadata?: Json
          provider?: string
          rotated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_machine_credentials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_mcp_tokens: {
        Row: {
          account_id: string
          created_at: string
          created_by_user_id: string | null
          expires_at: string | null
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes: string[]
          token_hash: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by_user_id?: string | null
          expires_at?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_mcp_tokens_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_memberships: {
        Row: {
          account_id: string
          invited_by_user_id: string | null
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          account_id: string
          invited_by_user_id?: string | null
          joined_at?: string
          role: string
          user_id: string
        }
        Update: {
          account_id?: string
          invited_by_user_id?: string | null
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_memberships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_resource_link_dismissals: {
        Row: {
          account_id: string
          archived_at: string | null
          created_at: string
          dismissed_at: string
          dismissed_by_user_id: string | null
          evidence_fingerprint: string
          id: string
          match_tier: string
          resource_kind: string
          source_external_id: string
          source_provider: string
          target_external_id: string
          target_provider: string
          updated_at: string
        }
        Insert: {
          account_id: string
          archived_at?: string | null
          created_at?: string
          dismissed_at: string
          dismissed_by_user_id?: string | null
          evidence_fingerprint: string
          id?: string
          match_tier: string
          resource_kind: string
          source_external_id: string
          source_provider: string
          target_external_id: string
          target_provider: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          archived_at?: string | null
          created_at?: string
          dismissed_at?: string
          dismissed_by_user_id?: string | null
          evidence_fingerprint?: string
          id?: string
          match_tier?: string
          resource_kind?: string
          source_external_id?: string
          source_provider?: string
          target_external_id?: string
          target_provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_resource_link_dismissals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      account_resource_links: {
        Row: {
          account_id: string
          archived_at: string | null
          confirmed_at: string
          confirmed_by_user_id: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          match_basis: string
          resource_kind: string
          source_external_id: string
          source_label: string | null
          source_provider: string
          target_external_id: string
          target_label: string | null
          target_provider: string
          updated_at: string
        }
        Insert: {
          account_id: string
          archived_at?: string | null
          confirmed_at: string
          confirmed_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          match_basis: string
          resource_kind: string
          source_external_id: string
          source_label?: string | null
          source_provider: string
          target_external_id: string
          target_label?: string | null
          target_provider: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          archived_at?: string | null
          confirmed_at?: string
          confirmed_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          match_basis?: string
          resource_kind?: string
          source_external_id?: string
          source_label?: string | null
          source_provider?: string
          target_external_id?: string
          target_label?: string | null
          target_provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_resource_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string
          deletion_requested_at: string | null
          deletion_requested_by: string | null
          deletion_status: string
          id: string
          name: string
          owner_user_id: string
          purge_after: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          deletion_status?: string
          id?: string
          name: string
          owner_user_id: string
          purge_after?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          deletion_status?: string
          id?: string
          name?: string
          owner_user_id?: string
          purge_after?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      agent_change_history: {
        Row: {
          account_id: string
          added_node_count: number
          agent_change_id: string
          ai_cost_event_id: string | null
          changed_config_count: number
          changed_node_count: number
          checkpoint_id: string | null
          created_at: string
          created_by_user_id: string | null
          diff: Json | null
          failure_reason: string | null
          id: string
          metadata: Json
          preview_patch_ref: string | null
          prompt: string | null
          removed_node_count: number
          run_id: string | null
          setup_issue_count: number
          source: string
          status: string
          summary: string | null
          title: string | null
          updated_at: string
          workflow_id: string
        }
        Insert: {
          account_id: string
          added_node_count?: number
          agent_change_id: string
          ai_cost_event_id?: string | null
          changed_config_count?: number
          changed_node_count?: number
          checkpoint_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          diff?: Json | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          preview_patch_ref?: string | null
          prompt?: string | null
          removed_node_count?: number
          run_id?: string | null
          setup_issue_count?: number
          source?: string
          status: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          workflow_id: string
        }
        Update: {
          account_id?: string
          added_node_count?: number
          agent_change_id?: string
          ai_cost_event_id?: string | null
          changed_config_count?: number
          changed_node_count?: number
          checkpoint_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          diff?: Json | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          preview_patch_ref?: string | null
          prompt?: string | null
          removed_node_count?: number
          run_id?: string | null
          setup_issue_count?: number
          source?: string
          status?: string
          summary?: string | null
          title?: string | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_change_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_change_history_ai_cost_event_id_fkey"
            columns: ["ai_cost_event_id"]
            isOneToOne: false
            referencedRelation: "ai_cost_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_change_history_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "workflow_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_change_history_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_change_history_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_cost_events: {
        Row: {
          accepted: boolean | null
          account_id: string | null
          ai_credits_charged: number | null
          anonymized_at: string | null
          conversation_id: string | null
          created_at: string
          estimated_cost_micros: number | null
          event_type: string
          feature: string
          id: string
          input_tokens: number | null
          latency_ms: number | null
          ledger_purge_after: string | null
          metadata: Json
          model_name: string | null
          model_provider: string | null
          output_tokens: number | null
          patch_id: string | null
          prompt_version: string | null
          safety_block_reason: string | null
          success: boolean | null
          tool_name: string | null
          tool_status: string | null
          total_tokens: number | null
          user_id: string | null
          validation_error_code: string | null
          workflow_id: string | null
          workflow_run_id: string | null
        }
        Insert: {
          accepted?: boolean | null
          account_id?: string | null
          ai_credits_charged?: number | null
          anonymized_at?: string | null
          conversation_id?: string | null
          created_at?: string
          estimated_cost_micros?: number | null
          event_type: string
          feature: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          ledger_purge_after?: string | null
          metadata?: Json
          model_name?: string | null
          model_provider?: string | null
          output_tokens?: number | null
          patch_id?: string | null
          prompt_version?: string | null
          safety_block_reason?: string | null
          success?: boolean | null
          tool_name?: string | null
          tool_status?: string | null
          total_tokens?: number | null
          user_id?: string | null
          validation_error_code?: string | null
          workflow_id?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          accepted?: boolean | null
          account_id?: string | null
          ai_credits_charged?: number | null
          anonymized_at?: string | null
          conversation_id?: string | null
          created_at?: string
          estimated_cost_micros?: number | null
          event_type?: string
          feature?: string
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          ledger_purge_after?: string | null
          metadata?: Json
          model_name?: string | null
          model_provider?: string | null
          output_tokens?: number | null
          patch_id?: string | null
          prompt_version?: string | null
          safety_block_reason?: string | null
          success?: boolean | null
          tool_name?: string | null
          tool_status?: string | null
          total_tokens?: number | null
          user_id?: string | null
          validation_error_code?: string | null
          workflow_id?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_cost_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_cost_events_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_cost_events_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_dashboards: {
        Row: {
          account_id: string
          created_at: string
          created_by_user_id: string | null
          id: string
          is_default: boolean
          name: string
          position: number
          updated_at: string
          widgets: Json
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          is_default?: boolean
          name: string
          position?: number
          updated_at?: string
          widgets?: Json
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          is_default?: boolean
          name?: string
          position?: number
          updated_at?: string
          widgets?: Json
        }
        Relationships: [
          {
            foreignKeyName: "analytics_dashboards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_provider_rate_limits: {
        Row: {
          bucket_key: string
          count: number
          expires_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          expires_at: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          count?: number
          expires_at?: string
          window_start?: string
        }
        Relationships: []
      }
      analytics_source_snapshots: {
        Row: {
          account_id: string
          cache_key: string
          created_at: string
          expires_at: string
          filters_hash: string
          generated_at: string
          group_by: string | null
          id: string
          metric_key: string
          provider_key: string
          range_key: string
          result: Json
          source_user_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          cache_key: string
          created_at?: string
          expires_at: string
          filters_hash: string
          generated_at: string
          group_by?: string | null
          id?: string
          metric_key: string
          provider_key: string
          range_key: string
          result: Json
          source_user_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          cache_key?: string
          created_at?: string
          expires_at?: string
          filters_hash?: string
          generated_at?: string
          group_by?: string | null
          id?: string
          metric_key?: string
          provider_key?: string
          range_key?: string
          result?: Json
          source_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_source_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      api_key_rate_limits: {
        Row: {
          bucket_key: string
          count: number
          expires_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          expires_at: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          count?: number
          expires_at?: string
          window_start?: string
        }
        Relationships: []
      }
      billing_shadow_comparisons: {
        Row: {
          account_id: string | null
          actual_billable_tasks: number
          anonymized_at: string | null
          billing_mode: string
          created_at: string
          delta_vs_flat: number
          estimated_tasks_per_run: number
          flat_charged_tasks: number
          id: string
          ledger_purge_after: string | null
          policy_version: string
          proposed_reconciled_tasks: number
          proposed_refunded_tasks: number
          proposed_reserved_tasks: number
          warning_codes: string[]
          workflow_id: string | null
          workflow_run_id: string | null
          would_have_had_enough_balance: boolean | null
          would_have_reserved: boolean
        }
        Insert: {
          account_id?: string | null
          actual_billable_tasks: number
          anonymized_at?: string | null
          billing_mode?: string
          created_at?: string
          delta_vs_flat: number
          estimated_tasks_per_run: number
          flat_charged_tasks: number
          id?: string
          ledger_purge_after?: string | null
          policy_version: string
          proposed_reconciled_tasks: number
          proposed_refunded_tasks: number
          proposed_reserved_tasks: number
          warning_codes?: string[]
          workflow_id?: string | null
          workflow_run_id?: string | null
          would_have_had_enough_balance?: boolean | null
          would_have_reserved: boolean
        }
        Update: {
          account_id?: string | null
          actual_billable_tasks?: number
          anonymized_at?: string | null
          billing_mode?: string
          created_at?: string
          delta_vs_flat?: number
          estimated_tasks_per_run?: number
          flat_charged_tasks?: number
          id?: string
          ledger_purge_after?: string | null
          policy_version?: string
          proposed_reconciled_tasks?: number
          proposed_refunded_tasks?: number
          proposed_reserved_tasks?: number
          warning_codes?: string[]
          workflow_id?: string | null
          workflow_run_id?: string | null
          would_have_had_enough_balance?: boolean | null
          would_have_reserved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "billing_shadow_comparisons_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_agent_messages: {
        Row: {
          agent_change_id: string | null
          base_graph_version: string | null
          client_message_id: string | null
          content: string | null
          created_at: string
          id: string
          kind: string
          proposal: Json | null
          request_id: string | null
          role: string
          safe_payload: Json
          thread_id: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          agent_change_id?: string | null
          base_graph_version?: string | null
          client_message_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          kind: string
          proposal?: Json | null
          request_id?: string | null
          role: string
          safe_payload?: Json
          thread_id: string
          user_id: string
          workflow_id: string
        }
        Update: {
          agent_change_id?: string | null
          base_graph_version?: string | null
          client_message_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          proposal?: Json | null
          request_id?: string | null
          role?: string
          safe_payload?: Json
          thread_id?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_agent_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "builder_agent_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_agent_messages_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_agent_threads: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_agent_threads_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_onboarding_states: {
        Row: {
          account_id: string
          celebrated_at: string | null
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          first_shown_at: string | null
          minimized: boolean
          track: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          celebrated_at?: string | null
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          first_shown_at?: string | null
          minimized?: boolean
          track: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          celebrated_at?: string | null
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          first_shown_at?: string | null
          minimized?: boolean
          track?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_onboarding_states_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      hubspot_app_subscriptions: {
        Row: {
          app_id: string
          created_at: string
          event_type: string
          hubspot_subscription_id: string
          id: string
          property_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          app_id: string
          created_at?: string
          event_type: string
          hubspot_subscription_id: string
          id?: string
          property_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          created_at?: string
          event_type?: string
          hubspot_subscription_id?: string
          id?: string
          property_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      hubspot_subscription_refs: {
        Row: {
          app_subscription_id: string
          config: Json
          created_at: string
          hub_id: string
          id: string
          node_id: string
          status: string
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          app_subscription_id: string
          config?: Json
          created_at?: string
          hub_id: string
          id?: string
          node_id: string
          status?: string
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          app_subscription_id?: string
          config?: Json
          created_at?: string
          hub_id?: string
          id?: string
          node_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hubspot_subscription_refs_app_subscription_id_fkey"
            columns: ["app_subscription_id"]
            isOneToOne: false
            referencedRelation: "hubspot_app_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hubspot_subscription_refs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token_encrypted: string
          access_token_expires_at: string | null
          account_id: string
          account_metadata: Json
          connected_by_user_id: string | null
          created_at: string
          disconnected_at: string | null
          display_name: string | null
          extra_credentials_encrypted: string | null
          id: string
          integration_sharing_scope: string | null
          needs_reconnect_at: string | null
          provider: string
          provider_account_id: string
          refresh_claim_id: string | null
          refresh_claimed_at: string | null
          refresh_token_encrypted: string | null
          scopes: string[]
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          access_token_expires_at?: string | null
          account_id: string
          account_metadata?: Json
          connected_by_user_id?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_name?: string | null
          extra_credentials_encrypted?: string | null
          id?: string
          integration_sharing_scope?: string | null
          needs_reconnect_at?: string | null
          provider: string
          provider_account_id: string
          refresh_claim_id?: string | null
          refresh_claimed_at?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          access_token_expires_at?: string | null
          account_id?: string
          account_metadata?: Json
          connected_by_user_id?: string | null
          created_at?: string
          disconnected_at?: string | null
          display_name?: string | null
          extra_credentials_encrypted?: string | null
          id?: string
          integration_sharing_scope?: string | null
          needs_reconnect_at?: string | null
          provider?: string
          provider_account_id?: string
          refresh_claim_id?: string | null
          refresh_claimed_at?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_admins: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      machine_credential_audit: {
        Row: {
          account_id: string
          actor_user_id: string | null
          created_at: string
          credential_id: string | null
          detail: Json
          event: string
          id: string
          provider: string
        }
        Insert: {
          account_id: string
          actor_user_id?: string | null
          created_at?: string
          credential_id?: string | null
          detail?: Json
          event: string
          id?: string
          provider: string
        }
        Update: {
          account_id?: string
          actor_user_id?: string | null
          created_at?: string
          credential_id?: string | null
          detail?: Json
          event?: string
          id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_credential_audit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "machine_credential_audit_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "account_machine_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_rate_limits: {
        Row: {
          bucket_key: string
          count: number
          expires_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          count?: number
          expires_at: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          count?: number
          expires_at?: string
          window_start?: string
        }
        Relationships: []
      }
      mcp_request_audit: {
        Row: {
          account_id: string
          created_at: string
          id: string
          method: string
          outcome: string
          reason: string | null
          token_id: string | null
          token_prefix: string | null
          tool: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          method: string
          outcome: string
          reason?: string | null
          token_id?: string | null
          token_prefix?: string | null
          tool?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          method?: string
          outcome?: string
          reason?: string | null
          token_id?: string | null
          token_prefix?: string | null
          tool?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_request_audit_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_request_audit_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "account_mcp_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string
          created_at: string
          id: string
          metadata: Json
          read_at: string | null
          severity: Database["public"]["Enums"]["notification_severity"]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body: string
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          severity: Database["public"]["Enums"]["notification_severity"]
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          severity?: Database["public"]["Enums"]["notification_severity"]
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: []
      }
      oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          nonce: string
          pkce_code_challenge_method: string | null
          pkce_code_verifier: string | null
          provider: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          nonce: string
          pkce_code_challenge_method?: string | null
          pkce_code_verifier?: string | null
          provider: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          nonce?: string
          pkce_code_challenge_method?: string | null
          pkce_code_verifier?: string | null
          provider?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_events: {
        Row: {
          account_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          provider: string | null
          step_key: string | null
          user_id: string | null
          workflow_id: string | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          provider?: string | null
          step_key?: string | null
          user_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          account_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          provider?: string | null
          step_key?: string | null
          user_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_alert_events: {
        Row: {
          category: string
          context: Json
          created_at: string
          dedupe_key: string
          first_seen_at: string
          id: string
          last_delivered_at: string | null
          last_seen_at: string
          occurrence_count: number
          resolved_at: string | null
          severity: string
          status: string
          window_label: string
        }
        Insert: {
          category: string
          context?: Json
          created_at?: string
          dedupe_key: string
          first_seen_at?: string
          id?: string
          last_delivered_at?: string | null
          last_seen_at?: string
          occurrence_count?: number
          resolved_at?: string | null
          severity: string
          status?: string
          window_label: string
        }
        Update: {
          category?: string
          context?: Json
          created_at?: string
          dedupe_key?: string
          first_seen_at?: string
          id?: string
          last_delivered_at?: string | null
          last_seen_at?: string
          occurrence_count?: number
          resolved_at?: string | null
          severity?: string
          status?: string
          window_label?: string
        }
        Relationships: []
      }
      ops_signal_events: {
        Row: {
          created_at: string
          detail_code: string | null
          id: string
          kind: string
          outcome: string
          source: string
        }
        Insert: {
          created_at?: string
          detail_code?: string | null
          id?: string
          kind: string
          outcome: string
          source: string
        }
        Update: {
          created_at?: string
          detail_code?: string | null
          id?: string
          kind?: string
          outcome?: string
          source?: string
        }
        Relationships: []
      }
      react_agent_audit_events: {
        Row: {
          account_id: string | null
          actor_user_id: string | null
          ai_cost_event_id: string | null
          anonymized_at: string | null
          approval_id: string | null
          audit_kind: string
          capability_id: string
          conversation_id: string | null
          created_at: string
          credit_feature: string | null
          id: string
          intent: string
          ledger_purge_after: string | null
          metadata: Json
          mode: string
          outcome: string
          proposed_patch_ref: string | null
          reason: string | null
          workflow_id: string | null
        }
        Insert: {
          account_id?: string | null
          actor_user_id?: string | null
          ai_cost_event_id?: string | null
          anonymized_at?: string | null
          approval_id?: string | null
          audit_kind: string
          capability_id: string
          conversation_id?: string | null
          created_at?: string
          credit_feature?: string | null
          id?: string
          intent: string
          ledger_purge_after?: string | null
          metadata?: Json
          mode: string
          outcome: string
          proposed_patch_ref?: string | null
          reason?: string | null
          workflow_id?: string | null
        }
        Update: {
          account_id?: string | null
          actor_user_id?: string | null
          ai_cost_event_id?: string | null
          anonymized_at?: string | null
          approval_id?: string | null
          audit_kind?: string
          capability_id?: string
          conversation_id?: string | null
          created_at?: string
          credit_feature?: string | null
          id?: string
          intent?: string
          ledger_purge_after?: string | null
          metadata?: Json
          mode?: string
          outcome?: string
          proposed_patch_ref?: string | null
          reason?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "react_agent_audit_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "react_agent_audit_events_ai_cost_event_id_fkey"
            columns: ["ai_cost_event_id"]
            isOneToOne: false
            referencedRelation: "ai_cost_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "react_agent_audit_events_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      sensitive_action_challenges: {
        Row: {
          attempt_count: number
          code_verifier: string
          consumed_at: string | null
          created_at: string
          email_binding: string
          expires_at: string
          id: string
          invalidated_at: string | null
          last_sent_at: string
          max_attempts: number
          purpose: string
          send_count: number
          session_binding: string
          updated_at: string
          user_id: string
          verification_expires_at: string | null
          verified_at: string | null
        }
        Insert: {
          attempt_count?: number
          code_verifier: string
          consumed_at?: string | null
          created_at?: string
          email_binding: string
          expires_at: string
          id?: string
          invalidated_at?: string | null
          last_sent_at?: string
          max_attempts?: number
          purpose: string
          send_count?: number
          session_binding: string
          updated_at?: string
          user_id: string
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Update: {
          attempt_count?: number
          code_verifier?: string
          consumed_at?: string | null
          created_at?: string
          email_binding?: string
          expires_at?: string
          id?: string
          invalidated_at?: string | null
          last_sent_at?: string
          max_attempts?: number
          purpose?: string
          send_count?: number
          session_binding?: string
          updated_at?: string
          user_id?: string
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      stripe_billing_events: {
        Row: {
          account_id: string | null
          event_id: string
          event_type: string
          processed_at: string
        }
        Insert: {
          account_id?: string | null
          event_id: string
          event_type: string
          processed_at?: string
        }
        Update: {
          account_id?: string | null
          event_id?: string
          event_type?: string
          processed_at?: string
        }
        Relationships: []
      }
      task_usage_events: {
        Row: {
          account_id: string | null
          actual_tasks: number | null
          anonymized_at: string | null
          billable: boolean
          charge_on: string | null
          cost_policy_version: string
          cost_reason: string | null
          created_at: string
          estimated_tasks: number | null
          event_type: string
          id: string
          ledger_purge_after: string | null
          metadata: Json
          node_id: string | null
          node_kind: string | null
          node_type: string | null
          provider: string | null
          tasks_charged: number
          test_mode: boolean
          workflow_id: string | null
          workflow_run_id: string | null
        }
        Insert: {
          account_id?: string | null
          actual_tasks?: number | null
          anonymized_at?: string | null
          billable?: boolean
          charge_on?: string | null
          cost_policy_version: string
          cost_reason?: string | null
          created_at?: string
          estimated_tasks?: number | null
          event_type: string
          id?: string
          ledger_purge_after?: string | null
          metadata?: Json
          node_id?: string | null
          node_kind?: string | null
          node_type?: string | null
          provider?: string | null
          tasks_charged?: number
          test_mode?: boolean
          workflow_id?: string | null
          workflow_run_id?: string | null
        }
        Update: {
          account_id?: string | null
          actual_tasks?: number | null
          anonymized_at?: string | null
          billable?: boolean
          charge_on?: string | null
          cost_policy_version?: string
          cost_reason?: string | null
          created_at?: string
          estimated_tasks?: number | null
          event_type?: string
          id?: string
          ledger_purge_after?: string | null
          metadata?: Json
          node_id?: string | null
          node_kind?: string | null
          node_type?: string | null
          provider?: string | null
          tasks_charged?: number
          test_mode?: boolean
          workflow_id?: string | null
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_usage_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_usage_events_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_usage_events_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      trigger_resources: {
        Row: {
          account_id: string | null
          config: Json
          created_at: string
          event_type: string
          expires_at: string | null
          id: string
          last_renewed_at: string | null
          node_id: string
          provider: string
          registered_at: string
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          account_id?: string | null
          config?: Json
          created_at?: string
          event_type: string
          expires_at?: string | null
          id?: string
          last_renewed_at?: string | null
          node_id: string
          provider: string
          registered_at?: string
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          account_id?: string | null
          config?: Json
          created_at?: string
          event_type?: string
          expires_at?: string | null
          id?: string
          last_renewed_at?: string | null
          node_id?: string
          provider?: string
          registered_at?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trigger_resources_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding_states: {
        Row: {
          account_id: string
          celebrated_at: string | null
          completed_at: string | null
          completion_workflow_id: string | null
          completion_workflow_name: string | null
          created_at: string
          dismissed_at: string | null
          first_shown_at: string | null
          minimized: boolean
          selected_workflow_id: string | null
          updated_at: string
          user_id: string
          video_watched_at: string | null
        }
        Insert: {
          account_id: string
          celebrated_at?: string | null
          completed_at?: string | null
          completion_workflow_id?: string | null
          completion_workflow_name?: string | null
          created_at?: string
          dismissed_at?: string | null
          first_shown_at?: string | null
          minimized?: boolean
          selected_workflow_id?: string | null
          updated_at?: string
          user_id: string
          video_watched_at?: string | null
        }
        Update: {
          account_id?: string
          celebrated_at?: string | null
          completed_at?: string | null
          completion_workflow_id?: string | null
          completion_workflow_name?: string | null
          created_at?: string
          dismissed_at?: string | null
          first_shown_at?: string | null
          minimized?: boolean
          selected_workflow_id?: string | null
          updated_at?: string
          user_id?: string
          video_watched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_states_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_onboarding_states_completion_workflow_id_fkey"
            columns: ["completion_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_onboarding_states_selected_workflow_id_fkey"
            columns: ["selected_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          active_account_id: string | null
          created_at: string
          default_builder_view: string | null
          display_name: string | null
          id: string
          notify_product_updates: boolean
          notify_team_activity: boolean
          notify_workflow_alerts: boolean
          updated_at: string
        }
        Insert: {
          active_account_id?: string | null
          created_at?: string
          default_builder_view?: string | null
          display_name?: string | null
          id: string
          notify_product_updates?: boolean
          notify_team_activity?: boolean
          notify_workflow_alerts?: boolean
          updated_at?: string
        }
        Update: {
          active_account_id?: string | null
          created_at?: string
          default_builder_view?: string | null
          display_name?: string | null
          id?: string
          notify_product_updates?: boolean
          notify_team_activity?: boolean
          notify_workflow_alerts?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_active_account_id_fkey"
            columns: ["active_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_event_dedup: {
        Row: {
          event_id: string
          expires_at: string
          id: string
          provider: string
          received_at: string
        }
        Insert: {
          event_id: string
          expires_at?: string
          id?: string
          provider: string
          received_at?: string
        }
        Update: {
          event_id?: string
          expires_at?: string
          id?: string
          provider?: string
          received_at?: string
        }
        Relationships: []
      }
      workflow_checkpoints: {
        Row: {
          account_id: string
          created_at: string
          created_by_user_id: string | null
          definition: Json
          id: string
          name: string
          prompt: string | null
          source: string
          summary: string | null
          workflow_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by_user_id?: string | null
          definition: Json
          id?: string
          name: string
          prompt?: string | null
          source: string
          summary?: string | null
          workflow_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by_user_id?: string | null
          definition?: Json
          id?: string
          name?: string
          prompt?: string | null
          source?: string
          summary?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_checkpoints_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_checkpoints_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_files: {
        Row: {
          created_at: string
          expires_at: string
          file_name: string
          id: string
          metadata: Json
          mime_type: string
          node_id: string
          run_id: string
          size_bytes: number | null
          storage_path: string
          updated_at: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          file_name: string
          id?: string
          metadata?: Json
          mime_type: string
          node_id: string
          run_id: string
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          user_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          file_name?: string
          id?: string
          metadata?: Json
          mime_type?: string
          node_id?: string
          run_id?: string
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_files_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_folders: {
        Row: {
          account_id: string
          created_at: string
          created_by_user_id: string | null
          delete_operation_id: string | null
          deleted_at: string | null
          deleted_by_user_id: string | null
          deleted_from_parent_folder_id: string | null
          id: string
          name: string
          parent_folder_id: string | null
          position: number
          purge_after: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by_user_id?: string | null
          delete_operation_id?: string | null
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          deleted_from_parent_folder_id?: string | null
          id?: string
          name: string
          parent_folder_id?: string | null
          position?: number
          purge_after?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by_user_id?: string | null
          delete_operation_id?: string | null
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          deleted_from_parent_folder_id?: string | null
          id?: string
          name?: string
          parent_folder_id?: string | null
          position?: number
          purge_after?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_folders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_folders_parent_folder_id_fkey"
            columns: ["parent_folder_id"]
            isOneToOne: false
            referencedRelation: "workflow_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_live_test_sessions: {
        Row: {
          account_id: string
          cancelled_at: string | null
          capture_baseline: Json | null
          captured_event: Json | null
          connection_ids: string[]
          consented_at: string | null
          consumed_at: string | null
          created_at: string
          definition_hash: string
          execution_authorized_at: string | null
          expires_at: string
          failure_code: string | null
          failure_message: string | null
          id: string
          nonce: string
          status: Database["public"]["Enums"]["workflow_live_test_status"]
          trigger_captured_at: string | null
          trigger_event_type: string
          trigger_node_id: string
          trigger_preview: Json | null
          trigger_provider: string
          updated_at: string
          user_id: string
          workflow_id: string
          workflow_run_id: string | null
        }
        Insert: {
          account_id: string
          cancelled_at?: string | null
          capture_baseline?: Json | null
          captured_event?: Json | null
          connection_ids?: string[]
          consented_at?: string | null
          consumed_at?: string | null
          created_at?: string
          definition_hash: string
          execution_authorized_at?: string | null
          expires_at: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          nonce: string
          status?: Database["public"]["Enums"]["workflow_live_test_status"]
          trigger_captured_at?: string | null
          trigger_event_type: string
          trigger_node_id: string
          trigger_preview?: Json | null
          trigger_provider: string
          updated_at?: string
          user_id: string
          workflow_id: string
          workflow_run_id?: string | null
        }
        Update: {
          account_id?: string
          cancelled_at?: string | null
          capture_baseline?: Json | null
          captured_event?: Json | null
          connection_ids?: string[]
          consented_at?: string | null
          consumed_at?: string | null
          created_at?: string
          definition_hash?: string
          execution_authorized_at?: string | null
          expires_at?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          nonce?: string
          status?: Database["public"]["Enums"]["workflow_live_test_status"]
          trigger_captured_at?: string | null
          trigger_event_type?: string
          trigger_node_id?: string
          trigger_preview?: Json | null
          trigger_provider?: string
          updated_at?: string
          user_id?: string
          workflow_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_live_test_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_live_test_sessions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_live_test_sessions_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_node_connector_bindings: {
        Row: {
          connector_user_id: string
          created_at: string
          created_by_user_id: string | null
          id: string
          node_id: string
          provider: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          connector_user_id: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          node_id: string
          provider: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          connector_user_id?: string
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          node_id?: string
          provider?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_connector_bindings_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_node_credentials: {
        Row: {
          created_at: string
          credential_owner_user_id: string
          decided_at: string | null
          id: string
          node_id: string
          provider: string
          requested_at: string
          requested_by_user_id: string | null
          status: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          credential_owner_user_id: string
          decided_at?: string | null
          id?: string
          node_id: string
          provider: string
          requested_at?: string
          requested_by_user_id?: string | null
          status?: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          credential_owner_user_id?: string
          decided_at?: string | null
          id?: string
          node_id?: string
          provider?: string
          requested_at?: string
          requested_by_user_id?: string | null
          status?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_credentials_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_revisions: {
        Row: {
          created_at: string
          definition: Json
          id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          definition: Json
          id?: string
          workflow_id: string
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_revisions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          account_id: string
          actual_task_cost: number | null
          billing_reconciled_at: string | null
          billing_status: string | null
          created_at: string
          error_classification: Json | null
          error_notifications_sent_at: string | null
          estimated_task_cost: number | null
          fatal_error: Json | null
          finished_at: string | null
          id: string
          is_test: boolean
          reconciled_task_cost: number | null
          reservation_expires_at: string | null
          reservation_id: string | null
          reserved_task_cost: number | null
          revision_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["workflow_run_status"]
          steps: Json
          task_cost_policy_version: string | null
          trigger_event: Json
          trigger_node_id: string
          triggered_by: string
          triggered_by_api_key_id: string | null
          triggered_by_api_key_prefix: string | null
          triggered_by_user_id: string | null
          workflow_id: string
        }
        Insert: {
          account_id: string
          actual_task_cost?: number | null
          billing_reconciled_at?: string | null
          billing_status?: string | null
          created_at?: string
          error_classification?: Json | null
          error_notifications_sent_at?: string | null
          estimated_task_cost?: number | null
          fatal_error?: Json | null
          finished_at?: string | null
          id?: string
          is_test?: boolean
          reconciled_task_cost?: number | null
          reservation_expires_at?: string | null
          reservation_id?: string | null
          reserved_task_cost?: number | null
          revision_id?: string | null
          started_at: string
          status: Database["public"]["Enums"]["workflow_run_status"]
          steps?: Json
          task_cost_policy_version?: string | null
          trigger_event: Json
          trigger_node_id: string
          triggered_by?: string
          triggered_by_api_key_id?: string | null
          triggered_by_api_key_prefix?: string | null
          triggered_by_user_id?: string | null
          workflow_id: string
        }
        Update: {
          account_id?: string
          actual_task_cost?: number | null
          billing_reconciled_at?: string | null
          billing_status?: string | null
          created_at?: string
          error_classification?: Json | null
          error_notifications_sent_at?: string | null
          estimated_task_cost?: number | null
          fatal_error?: Json | null
          finished_at?: string | null
          id?: string
          is_test?: boolean
          reconciled_task_cost?: number | null
          reservation_expires_at?: string | null
          reservation_id?: string | null
          reserved_task_cost?: number | null
          revision_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["workflow_run_status"]
          steps?: Json
          task_cost_policy_version?: string | null
          trigger_event?: Json
          trigger_node_id?: string
          triggered_by?: string
          triggered_by_api_key_id?: string | null
          triggered_by_api_key_prefix?: string | null
          triggered_by_user_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "workflow_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_triggered_by_api_key_id_fkey"
            columns: ["triggered_by_api_key_id"]
            isOneToOne: false
            referencedRelation: "account_api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_usage_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          created_template_id: string | null
          created_workflow_id: string | null
          event_type: string
          id: string
          target_account_id: string | null
          template_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          created_template_id?: string | null
          created_workflow_id?: string | null
          event_type: string
          id?: string
          target_account_id?: string | null
          template_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          created_template_id?: string | null
          created_workflow_id?: string | null
          event_type?: string
          id?: string
          target_account_id?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_usage_events_created_template_id_fkey"
            columns: ["created_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_usage_events_created_workflow_id_fkey"
            columns: ["created_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_usage_events_target_account_id_fkey"
            columns: ["target_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_template_usage_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          account_id: string | null
          created_at: string
          created_by_user_id: string | null
          creator_display_name_snapshot: string | null
          definition: Json
          description: string | null
          fork_count: number
          forked_from_template_id: string | null
          id: string
          name: string
          published_at: string | null
          schema_version: number
          source: string
          unpublished_at: string | null
          updated_at: string
          usage_count: number
          visibility: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          creator_display_name_snapshot?: string | null
          definition: Json
          description?: string | null
          fork_count?: number
          forked_from_template_id?: string | null
          id?: string
          name: string
          published_at?: string | null
          schema_version: number
          source?: string
          unpublished_at?: string | null
          updated_at?: string
          usage_count?: number
          visibility?: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          creator_display_name_snapshot?: string | null
          definition?: Json
          description?: string | null
          fork_count?: number
          forked_from_template_id?: string | null
          id?: string
          name?: string
          published_at?: string | null
          schema_version?: number
          source?: string
          unpublished_at?: string | null
          updated_at?: string
          usage_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_forked_from_template_id_fkey"
            columns: ["forked_from_template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          account_id: string
          active_revision_id: string | null
          created_at: string
          created_by_user_id: string | null
          delete_operation_id: string | null
          deleted_at: string | null
          deleted_by_user_id: string | null
          deleted_from_folder_id: string | null
          disabled_context: string | null
          disabled_reason:
            | Database["public"]["Enums"]["workflow_disabled_reason"]
            | null
          draft_definition: Json
          folder_id: string | null
          id: string
          name: string
          purge_after: string | null
          state: Database["public"]["Enums"]["workflow_state"]
          updated_at: string
        }
        Insert: {
          account_id: string
          active_revision_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          delete_operation_id?: string | null
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          deleted_from_folder_id?: string | null
          disabled_context?: string | null
          disabled_reason?:
            | Database["public"]["Enums"]["workflow_disabled_reason"]
            | null
          draft_definition?: Json
          folder_id?: string | null
          id?: string
          name: string
          purge_after?: string | null
          state?: Database["public"]["Enums"]["workflow_state"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          active_revision_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          delete_operation_id?: string | null
          deleted_at?: string | null
          deleted_by_user_id?: string | null
          deleted_from_folder_id?: string | null
          disabled_context?: string | null
          disabled_reason?:
            | Database["public"]["Enums"]["workflow_disabled_reason"]
            | null
          draft_definition?: Json
          folder_id?: string | null
          id?: string
          name?: string
          purge_after?: string | null
          state?: Database["public"]["Enums"]["workflow_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_active_revision_fk"
            columns: ["active_revision_id"]
            isOneToOne: false
            referencedRelation: "workflow_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "workflow_folders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      workflow_run_stats: {
        Row: {
          account_id: string | null
          last_run_at: string | null
          last_run_status:
            | Database["public"]["Enums"]["workflow_run_status"]
            | null
          succeeded: number | null
          total: number | null
          workflow_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      account_billing_period_start: {
        Args: { p_anchor: string; p_at: string }
        Returns: string
      }
      analytics_runs_aggregate: {
        Args: {
          p_account_id: string
          p_dimension?: string
          p_from: string
          p_grain?: string
          p_include_tests?: boolean
          p_limit?: number
          p_series_by?: string
          p_statuses?: string[]
          p_to: string
          p_trigger_sources?: string[]
          p_workflow_ids?: string[]
        }
        Returns: {
          bucket_start: string
          dur_count: number
          dur_sum_ms: number
          failed: number
          group_key: string
          runs: number
          succeeded: number
        }[]
      }
      apply_business_downgrade: {
        Args: {
          p_account_id: string
          p_ai_credits_limit: number
          p_plan_status: string
          p_tasks_limit: number
        }
        Returns: Json
      }
      apply_business_upgrade: {
        Args: {
          p_account_id: string
          p_ai_credits_limit: number
          p_cancel_at_period_end: boolean
          p_current_period_end: string
          p_plan_status: string
          p_stripe_customer_id: string
          p_stripe_subscription_id: string
          p_tasks_limit: number
        }
        Returns: Json
      }
      authorize_live_test_run: {
        Args: { p_enqueued_at: string; p_run_id: string; p_session_id: string }
        Returns: {
          outcome: string
          run_id: string
        }[]
      }
      claim_account_trial: {
        Args: {
          p_account_id: string
          p_origin_plan: string
          p_trial_ends_at: string
        }
        Returns: Json
      }
      deduct_ai_credits_if_available: {
        Args: { p_account_id: string; p_amount: number }
        Returns: Json
      }
      deduct_tasks_if_available: {
        Args: { p_account_id: string; p_amount: number }
        Returns: Json
      }
      find_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_account_member_identities: {
        Args: { p_account_id: string }
        Returns: {
          display_name: string
          email: string
          user_id: string
        }[]
      }
      increment_analytics_provider_rate_limits: {
        Args: {
          p_account_bucket: string
          p_expires_at: string
          p_source_bucket: string
          p_window_start: string
        }
        Returns: {
          account_count: number
          source_count: number
        }[]
      }
      increment_api_key_rate_limits: {
        Args: {
          p_account_bucket: string
          p_expires_at: string
          p_key_bucket: string
          p_window_start: string
          p_workflow_bucket: string
        }
        Returns: {
          account_count: number
          key_count: number
          workflow_count: number
        }[]
      }
      increment_mcp_rate_limits: {
        Args: {
          p_account_bucket: string
          p_expires_at: string
          p_token_bucket: string
          p_window_start: string
        }
        Returns: {
          account_count: number
          token_count: number
        }[]
      }
      is_account_member: { Args: { p_account_id: string }; Returns: boolean }
      reconcile_task_reservation: {
        Args: { p_account_id: string; p_actual: number; p_run_id: string }
        Returns: Json
      }
      release_expired_reservations: { Args: { p_now?: string }; Returns: Json }
      release_task_reservation: {
        Args: { p_account_id: string; p_run_id: string }
        Returns: Json
      }
      replace_account_invitation: {
        Args: {
          p_account_id: string
          p_invitation_id: string
          p_invited_by_user_id: string
          p_new_email: string
          p_new_token_hash: string
          p_now: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          account_id: string
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invited_by_user_id: string | null
          revoked_at: string | null
          role: string
          status: string
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "account_invitations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reserve_tasks_if_available: {
        Args: {
          p_account_id: string
          p_amount: number
          p_expires_at?: string
          p_run_id: string
        }
        Returns: Json
      }
      schedule_account_deletion: {
        Args: {
          p_account_id: string
          p_challenge_email_binding: string
          p_challenge_id: string
          p_challenge_purpose: string
          p_challenge_session_binding: string
          p_challenge_user_id: string
          p_purge_after: string
          p_requested_at: string
          p_requested_by_user_id: string
        }
        Returns: {
          out_account_id: string
          out_deletion_requested_at: string
          out_deletion_status: string
          out_outcome: string
          out_purge_after: string
        }[]
      }
      transfer_account_ownership: {
        Args: {
          p_account_id: string
          p_current_owner_user_id: string
          p_target_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      notification_severity: "warning" | "error"
      notification_type:
        | "workflow_failed"
        | "workflow_high_risk_activated"
        | "workflow_high_risk_run"
        | "account_invitation"
        | "api_key_created"
        | "api_key_revoked"
        | "integration_reconnect_needed"
      workflow_disabled_reason:
        | "integration_revoked"
        | "billing_exhausted"
        | "repeated_failure"
        | "manual_admin"
      workflow_live_test_status:
        | "awaiting_consent"
        | "waiting_for_trigger"
        | "trigger_received"
        | "authorizing_execution"
        | "running"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "expired"
      workflow_run_status: "succeeded" | "failed" | "running" | "queued"
      workflow_state:
        | "draft"
        | "active"
        | "paused"
        | "disabled"
        | "eligible_to_resume"
        | "deleted"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      notification_severity: ["warning", "error"],
      notification_type: [
        "workflow_failed",
        "workflow_high_risk_activated",
        "workflow_high_risk_run",
        "account_invitation",
        "api_key_created",
        "api_key_revoked",
        "integration_reconnect_needed",
      ],
      workflow_disabled_reason: [
        "integration_revoked",
        "billing_exhausted",
        "repeated_failure",
        "manual_admin",
      ],
      workflow_live_test_status: [
        "awaiting_consent",
        "waiting_for_trigger",
        "trigger_received",
        "authorizing_execution",
        "running",
        "succeeded",
        "failed",
        "cancelled",
        "expired",
      ],
      workflow_run_status: ["succeeded", "failed", "running", "queued"],
      workflow_state: [
        "draft",
        "active",
        "paused",
        "disabled",
        "eligible_to_resume",
        "deleted",
      ],
    },
  },
} as const

