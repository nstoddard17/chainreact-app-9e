export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      account_linking_codes: {
        Row: {
          access_token: string
          created_at: string | null
          email: string
          expires_at: string
          google_email: string
          google_id: string
          google_name: string
          google_picture: string | null
          id: string
          id_token: string
          used_at: string | null
          verification_code: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          email: string
          expires_at: string
          google_email: string
          google_id: string
          google_name: string
          google_picture?: string | null
          id?: string
          id_token: string
          used_at?: string | null
          verification_code: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          email?: string
          expires_at?: string
          google_email?: string
          google_id?: string
          google_name?: string
          google_picture?: string | null
          id?: string
          id_token?: string
          used_at?: string | null
          verification_code?: string
        }
        Relationships: []
      }
      advanced_integrations: {
        Row: {
          configuration: Json
          created_at: string | null
          credentials: Json
          error_count: number | null
          id: string
          integration_name: string
          last_error: string | null
          last_sync_at: string | null
          metadata: Json | null
          organization_id: string | null
          provider: string
          rate_limits: Json | null
          status: string | null
          sync_frequency: string | null
          updated_at: string | null
          user_id: string
          webhook_config: Json | null
        }
        Insert: {
          configuration?: Json
          created_at?: string | null
          credentials?: Json
          error_count?: number | null
          id?: string
          integration_name: string
          last_error?: string | null
          last_sync_at?: string | null
          metadata?: Json | null
          organization_id?: string | null
          provider: string
          rate_limits?: Json | null
          status?: string | null
          sync_frequency?: string | null
          updated_at?: string | null
          user_id: string
          webhook_config?: Json | null
        }
        Update: {
          configuration?: Json
          created_at?: string | null
          credentials?: Json
          error_count?: number | null
          id?: string
          integration_name?: string
          last_error?: string | null
          last_sync_at?: string | null
          metadata?: Json | null
          organization_id?: string | null
          provider?: string
          rate_limits?: Json | null
          status?: string | null
          sync_frequency?: string | null
          updated_at?: string | null
          user_id?: string
          webhook_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "advanced_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_anomaly_detections: {
        Row: {
          anomaly_type: string
          created_at: string | null
          description: string
          detected_patterns: Json | null
          execution_id: string | null
          id: string
          resolved: boolean | null
          resolved_at: string | null
          severity: string
          suggested_actions: Json | null
          workflow_id: string
        }
        Insert: {
          anomaly_type: string
          created_at?: string | null
          description: string
          detected_patterns?: Json | null
          execution_id?: string | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity: string
          suggested_actions?: Json | null
          workflow_id: string
        }
        Update: {
          anomaly_type?: string
          created_at?: string | null
          description?: string
          detected_patterns?: Json | null
          execution_id?: string | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          severity?: string
          suggested_actions?: Json | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_anomaly_detections_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_anomaly_detections_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_history: {
        Row: {
          context: Json | null
          created_at: string | null
          id: string
          message: string
          response: string
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          id?: string
          message: string
          response: string
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          id?: string
          message?: string
          response?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_cost_logs: {
        Row: {
          calculated_cost: number
          cost: number
          created_at: string | null
          feature: string
          id: string
          input_tokens: number
          metadata: Json | null
          model: string
          output_tokens: number
          timestamp: string | null
          user_id: string | null
        }
        Insert: {
          calculated_cost: number
          cost: number
          created_at?: string | null
          feature: string
          id?: string
          input_tokens: number
          metadata?: Json | null
          model: string
          output_tokens: number
          timestamp?: string | null
          user_id?: string | null
        }
        Update: {
          calculated_cost?: number
          cost?: number
          created_at?: string | null
          feature?: string
          id?: string
          input_tokens?: number
          metadata?: Json | null
          model?: string
          output_tokens?: number
          timestamp?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ai_data_mappings: {
        Row: {
          confidence_scores: Json | null
          created_at: string | null
          id: string
          mapping_suggestions: Json
          source_schema: Json
          target_schema: Json
          updated_at: string | null
          user_approved: boolean | null
          workflow_id: string
        }
        Insert: {
          confidence_scores?: Json | null
          created_at?: string | null
          id?: string
          mapping_suggestions: Json
          source_schema: Json
          target_schema: Json
          updated_at?: string | null
          user_approved?: boolean | null
          workflow_id: string
        }
        Update: {
          confidence_scores?: Json | null
          created_at?: string | null
          id?: string
          mapping_suggestions?: Json
          source_schema?: Json
          target_schema?: Json
          updated_at?: string | null
          user_approved?: boolean | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_data_mappings_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_training_data: {
        Row: {
          actual_output: Json | null
          created_at: string | null
          data_type: string
          expected_output: Json
          feedback_score: number | null
          id: string
          input_data: Json
        }
        Insert: {
          actual_output?: Json | null
          created_at?: string | null
          data_type: string
          expected_output: Json
          feedback_score?: number | null
          id?: string
          input_data: Json
        }
        Update: {
          actual_output?: Json | null
          created_at?: string | null
          data_type?: string
          expected_output?: Json
          feedback_score?: number | null
          id?: string
          input_data?: Json
        }
        Relationships: []
      }
      ai_workflow_generations: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          feedback_rating: number | null
          feedback_text: string | null
          generated_workflow: Json
          id: string
          organization_id: string | null
          prompt: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          feedback_rating?: number | null
          feedback_text?: string | null
          generated_workflow: Json
          id?: string
          organization_id?: string | null
          prompt: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          feedback_rating?: number | null
          feedback_text?: string | null
          generated_workflow?: Json
          id?: string
          organization_id?: string | null
          prompt?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_workflow_generations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_workflow_optimizations: {
        Row: {
          applied: boolean | null
          applied_at: string | null
          created_at: string | null
          id: string
          optimization_type: string
          performance_metrics: Json | null
          suggestions: Json
          user_id: string
          workflow_id: string
        }
        Insert: {
          applied?: boolean | null
          applied_at?: string | null
          created_at?: string | null
          id?: string
          optimization_type: string
          performance_metrics?: Json | null
          suggestions: Json
          user_id: string
          workflow_id: string
        }
        Update: {
          applied?: boolean | null
          applied_at?: string | null
          created_at?: string | null
          id?: string
          optimization_type?: string
          performance_metrics?: Json | null
          suggestions?: Json
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_workflow_optimizations_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_metrics: {
        Row: {
          created_at: string | null
          dimensions: Json | null
          id: string
          metric_name: string
          metric_type: string
          organization_id: string | null
          timestamp: string
          user_id: string
          value: number
        }
        Insert: {
          created_at?: string | null
          dimensions?: Json | null
          id?: string
          metric_name: string
          metric_type: string
          organization_id?: string | null
          timestamp: string
          user_id: string
          value: number
        }
        Update: {
          created_at?: string | null
          dimensions?: Json | null
          id?: string
          metric_name?: string
          metric_type?: string
          organization_id?: string | null
          timestamp?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_metrics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string | null
          scopes: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id?: string | null
          scopes: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string | null
          scopes?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_logs: {
        Row: {
          api_key_id: string | null
          created_at: string | null
          endpoint: string
          id: string
          ip_address: unknown | null
          method: string
          organization_id: string | null
          request_size: number | null
          response_size: number | null
          response_time_ms: number
          status_code: number
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address?: unknown | null
          method: string
          organization_id?: string | null
          request_size?: number | null
          response_size?: number | null
          response_time_ms: number
          status_code: number
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: unknown | null
          method?: string
          organization_id?: string | null
          request_size?: number | null
          response_size?: number | null
          response_time_ms?: number
          status_code?: number
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: unknown | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automated_reports: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_generated_at: string | null
          name: string
          next_generation_at: string | null
          organization_id: string | null
          recipients: Json
          report_config: Json
          schedule_config: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          name: string
          next_generation_at?: string | null
          organization_id?: string | null
          recipients: Json
          report_config: Json
          schedule_config: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_generated_at?: string | null
          name?: string
          next_generation_at?: string | null
          organization_id?: string | null
          recipients?: Json
          report_config?: Json
          schedule_config?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automated_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_recovery_logs: {
        Row: {
          backup_type: string
          checksum: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          file_path: string | null
          file_size: number | null
          id: string
          operation_type: string
          organization_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          backup_type: string
          checksum?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          operation_type: string
          organization_id?: string | null
          started_at: string
          status: string
        }
        Update: {
          backup_type?: string
          checksum?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          operation_type?: string
          organization_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "backup_recovery_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      collaboration_sessions: {
        Row: {
          created_at: string | null
          cursor_position: Json | null
          id: string
          is_active: boolean | null
          last_activity: string | null
          selected_nodes: string[] | null
          session_token: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          cursor_position?: Json | null
          id?: string
          is_active?: boolean | null
          last_activity?: string | null
          selected_nodes?: string[] | null
          session_token: string
          user_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          cursor_position?: Json | null
          id?: string
          is_active?: boolean | null
          last_activity?: string | null
          selected_nodes?: string[] | null
          session_token?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaboration_sessions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_audit_logs: {
        Row: {
          action: string
          compliance_tags: string[] | null
          created_at: string | null
          geolocation: Json | null
          id: string
          ip_address: unknown | null
          new_values: Json | null
          old_values: Json | null
          organization_id: string | null
          resource_id: string | null
          resource_type: string
          retention_until: string | null
          risk_score: number | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          compliance_tags?: string[] | null
          created_at?: string | null
          geolocation?: Json | null
          id?: string
          ip_address?: unknown | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type: string
          retention_until?: string | null
          risk_score?: number | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          compliance_tags?: string[] | null
          created_at?: string | null
          geolocation?: Json | null
          id?: string
          ip_address?: unknown | null
          new_values?: Json | null
          old_values?: Json | null
          organization_id?: string | null
          resource_id?: string | null
          resource_type?: string
          retention_until?: string | null
          risk_score?: number | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_job_logs: {
        Row: {
          executed_at: string | null
          id: number
          job_name: string
          result: string | null
        }
        Insert: {
          executed_at?: string | null
          id?: number
          job_name: string
          result?: string | null
        }
        Update: {
          executed_at?: string | null
          id?: number
          job_name?: string
          result?: string | null
        }
        Relationships: []
      }
      custom_api_connectors: {
        Row: {
          api_type: string
          authentication: Json
          base_url: string
          created_at: string | null
          description: string | null
          headers: Json | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          rate_limits: Json | null
          schema_definition: Json | null
          updated_at: string | null
        }
        Insert: {
          api_type: string
          authentication: Json
          base_url: string
          created_at?: string | null
          description?: string | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          rate_limits?: Json | null
          schema_definition?: Json | null
          updated_at?: string | null
        }
        Update: {
          api_type?: string
          authentication?: Json
          base_url?: string
          created_at?: string | null
          description?: string | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          rate_limits?: Json | null
          schema_definition?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_api_connectors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_code_executions: {
        Row: {
          code: string
          created_at: string | null
          error_message: string | null
          execution_id: string | null
          execution_time_ms: number | null
          id: string
          input_data: Json | null
          language: string
          logs: string | null
          memory_usage_mb: number | null
          node_id: string
          output_data: Json | null
          status: string | null
          workflow_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          error_message?: string | null
          execution_id?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          language: string
          logs?: string | null
          memory_usage_mb?: number | null
          node_id: string
          output_data?: Json | null
          status?: string | null
          workflow_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          error_message?: string | null
          execution_id?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          language?: string
          logs?: string | null
          memory_usage_mb?: number | null
          node_id?: string
          output_data?: Json | null
          status?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_code_executions_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_code_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_code_libraries: {
        Row: {
          code: string
          created_at: string | null
          dependencies: Json | null
          description: string | null
          exports: Json | null
          id: string
          is_public: boolean | null
          language: string
          name: string
          organization_id: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string
          version: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          dependencies?: Json | null
          description?: string | null
          exports?: Json | null
          id?: string
          is_public?: boolean | null
          language: string
          name: string
          organization_id?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
          version?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          dependencies?: Json | null
          description?: string | null
          exports?: Json | null
          id?: string
          is_public?: boolean | null
          language?: string
          name?: string
          organization_id?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_code_libraries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_dashboards: {
        Row: {
          created_at: string | null
          description: string | null
          filters: Json | null
          id: string
          is_public: boolean | null
          is_template: boolean | null
          layout: Json
          name: string
          organization_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          filters?: Json | null
          id?: string
          is_public?: boolean | null
          is_template?: boolean | null
          layout: Json
          name: string
          organization_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          filters?: Json | null
          id?: string
          is_public?: boolean | null
          is_template?: boolean | null
          layout?: Json
          name?: string
          organization_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_dashboards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_integrations: {
        Row: {
          actions: Json
          approval_status: string | null
          auth_config: Json
          auth_type: string
          configuration_schema: Json
          created_at: string | null
          description: string | null
          developer_id: string
          documentation_url: string | null
          downloads_count: number | null
          id: string
          is_featured: boolean | null
          is_public: boolean | null
          is_verified: boolean | null
          logo_url: string | null
          name: string
          organization_id: string | null
          rating_average: number | null
          rating_count: number | null
          repository_url: string | null
          slug: string
          triggers: Json
          updated_at: string | null
          version: string
        }
        Insert: {
          actions: Json
          approval_status?: string | null
          auth_config: Json
          auth_type: string
          configuration_schema: Json
          created_at?: string | null
          description?: string | null
          developer_id: string
          documentation_url?: string | null
          downloads_count?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          is_verified?: boolean | null
          logo_url?: string | null
          name: string
          organization_id?: string | null
          rating_average?: number | null
          rating_count?: number | null
          repository_url?: string | null
          slug: string
          triggers: Json
          updated_at?: string | null
          version?: string
        }
        Update: {
          actions?: Json
          approval_status?: string | null
          auth_config?: Json
          auth_type?: string
          configuration_schema?: Json
          created_at?: string | null
          description?: string | null
          developer_id?: string
          documentation_url?: string | null
          downloads_count?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          is_verified?: boolean | null
          logo_url?: string | null
          name?: string
          organization_id?: string | null
          rating_average?: number | null
          rating_count?: number | null
          repository_url?: string | null
          slug?: string
          triggers?: Json
          updated_at?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_webhook_executions: {
        Row: {
          error_message: string | null
          execution_time_ms: number
          id: string
          payload_sent: Json | null
          response_body: string | null
          response_code: number | null
          status: string
          triggered_at: string | null
          user_id: string | null
          webhook_id: string | null
        }
        Insert: {
          error_message?: string | null
          execution_time_ms: number
          id?: string
          payload_sent?: Json | null
          response_body?: string | null
          response_code?: number | null
          status: string
          triggered_at?: string | null
          user_id?: string | null
          webhook_id?: string | null
        }
        Update: {
          error_message?: string | null
          execution_time_ms?: number
          id?: string
          payload_sent?: Json | null
          response_body?: string | null
          response_code?: number | null
          status?: string
          triggered_at?: string | null
          user_id?: string | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_webhook_executions_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "custom_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_webhooks: {
        Row: {
          body_template: string | null
          created_at: string | null
          description: string | null
          error_count: number | null
          headers: Json | null
          id: string
          last_triggered: string | null
          method: string
          name: string
          status: string | null
          trigger_count: number | null
          updated_at: string | null
          user_id: string | null
          webhook_url: string
        }
        Insert: {
          body_template?: string | null
          created_at?: string | null
          description?: string | null
          error_count?: number | null
          headers?: Json | null
          id?: string
          last_triggered?: string | null
          method: string
          name: string
          status?: string | null
          trigger_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          webhook_url: string
        }
        Update: {
          body_template?: string | null
          created_at?: string | null
          description?: string | null
          error_count?: number | null
          headers?: Json | null
          id?: string
          last_triggered?: string | null
          method?: string
          name?: string
          status?: string | null
          trigger_count?: number | null
          updated_at?: string | null
          user_id?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      dashboard_widgets: {
        Row: {
          configuration: Json
          created_at: string | null
          dashboard_id: string
          id: string
          position: Json
          size: Json
          title: string
          updated_at: string | null
          widget_type: string
        }
        Insert: {
          configuration: Json
          created_at?: string | null
          dashboard_id: string
          id?: string
          position: Json
          size: Json
          title: string
          updated_at?: string | null
          widget_type: string
        }
        Update: {
          configuration?: Json
          created_at?: string | null
          dashboard_id?: string
          id?: string
          position?: Json
          size?: Json
          title?: string
          updated_at?: string | null
          widget_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "custom_dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      data_deletion_requests: {
        Row: {
          completed_at: string | null
          created_at: string | null
          deletion_type: string
          id: string
          immediate: boolean
          integration_provider: string | null
          notes: string | null
          processed_by: string | null
          reason: string
          requested_at: string | null
          scheduled_for: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          deletion_type: string
          id?: string
          immediate?: boolean
          integration_provider?: string | null
          notes?: string | null
          processed_by?: string | null
          reason?: string
          requested_at?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          deletion_type?: string
          id?: string
          immediate?: boolean
          integration_provider?: string | null
          notes?: string | null
          processed_by?: string | null
          reason?: string
          requested_at?: string | null
          scheduled_for?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      data_subject_requests: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string | null
          data_subject_email: string
          data_subject_id: string | null
          id: string
          organization_id: string
          request_details: Json | null
          request_type: string
          response_data: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          data_subject_email: string
          data_subject_id?: string | null
          id?: string
          organization_id: string
          request_details?: Json | null
          request_type: string
          response_data?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string | null
          data_subject_email?: string
          data_subject_id?: string | null
          id?: string
          organization_id?: string
          request_details?: Json | null
          request_type?: string
          response_data?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_subject_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      database_connections: {
        Row: {
          connection_pool_config: Json | null
          connection_string: string
          created_at: string | null
          database_type: string
          encrypted_credentials: string
          id: string
          is_active: boolean | null
          last_tested_at: string | null
          name: string
          organization_id: string
          ssl_config: Json | null
          test_status: string | null
          updated_at: string | null
        }
        Insert: {
          connection_pool_config?: Json | null
          connection_string: string
          created_at?: string | null
          database_type: string
          encrypted_credentials: string
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          name: string
          organization_id: string
          ssl_config?: Json | null
          test_status?: string | null
          updated_at?: string | null
        }
        Update: {
          connection_pool_config?: Json | null
          connection_string?: string
          created_at?: string | null
          database_type?: string
          encrypted_credentials?: string
          id?: string
          is_active?: boolean | null
          last_tested_at?: string | null
          name?: string
          organization_id?: string
          ssl_config?: Json | null
          test_status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "database_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_queue: {
        Row: {
          created_at: string | null
          error_data: Json
          execution_id: string
          id: string
          max_retries: number | null
          retry_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_data: Json
          execution_id: string
          id?: string
          max_retries?: number | null
          retry_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_data?: Json
          execution_id?: string
          id?: string
          max_retries?: number | null
          retry_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dead_letter_queue_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      deployment_configurations: {
        Row: {
          backup_config: Json | null
          configuration: Json
          created_at: string | null
          custom_domain: string | null
          deployment_type: string
          disaster_recovery_config: Json | null
          id: string
          is_active: boolean | null
          organization_id: string
          ssl_certificate: string | null
          updated_at: string | null
          white_label_config: Json | null
        }
        Insert: {
          backup_config?: Json | null
          configuration: Json
          created_at?: string | null
          custom_domain?: string | null
          deployment_type: string
          disaster_recovery_config?: Json | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          ssl_certificate?: string | null
          updated_at?: string | null
          white_label_config?: Json | null
        }
        Update: {
          backup_config?: Json | null
          configuration?: Json
          created_at?: string | null
          custom_domain?: string | null
          deployment_type?: string
          disaster_recovery_config?: Json | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          ssl_certificate?: string | null
          updated_at?: string | null
          white_label_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "deployment_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      developer_profiles: {
        Row: {
          bio: string | null
          created_at: string | null
          display_name: string | null
          github_username: string | null
          id: string
          is_verified: boolean | null
          linkedin_url: string | null
          twitter_username: string | null
          updated_at: string | null
          user_id: string
          website_url: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          github_username?: string | null
          id?: string
          is_verified?: boolean | null
          linkedin_url?: string | null
          twitter_username?: string | null
          updated_at?: string | null
          user_id: string
          website_url?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          github_username?: string | null
          id?: string
          is_verified?: boolean | null
          linkedin_url?: string | null
          twitter_username?: string | null
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      email_frequency_cache: {
        Row: {
          created_at: string
          email: string
          frequency: number
          id: string
          integration_id: string | null
          last_used: string
          metadata: Json | null
          name: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          frequency?: number
          id?: string
          integration_id?: string | null
          last_used?: string
          metadata?: Json | null
          name?: string | null
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          frequency?: number
          id?: string
          integration_id?: string | null
          last_used?: string
          metadata?: Json | null
          name?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_frequency_cache_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      encryption_keys: {
        Row: {
          algorithm: string
          created_at: string | null
          encrypted_key: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          key_identifier: string
          key_type: string
          key_version: number | null
          organization_id: string | null
        }
        Insert: {
          algorithm: string
          created_at?: string | null
          encrypted_key: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_identifier: string
          key_type: string
          key_version?: number | null
          organization_id?: string | null
        }
        Update: {
          algorithm?: string
          created_at?: string | null
          encrypted_key?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          key_identifier?: string
          key_type?: string
          key_version?: number | null
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "encryption_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enterprise_integrations: {
        Row: {
          configuration: Json
          connection_status: string | null
          created_at: string | null
          credentials: Json
          error_count: number | null
          id: string
          integration_type: string
          last_error: string | null
          last_sync_at: string | null
          organization_id: string
          provider: string
          sync_frequency: unknown | null
          updated_at: string | null
        }
        Insert: {
          configuration: Json
          connection_status?: string | null
          created_at?: string | null
          credentials: Json
          error_count?: number | null
          id?: string
          integration_type: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id: string
          provider: string
          sync_frequency?: unknown | null
          updated_at?: string | null
        }
        Update: {
          configuration?: Json
          connection_status?: string | null
          created_at?: string | null
          credentials?: Json
          error_count?: number | null
          id?: string
          integration_type?: string
          last_error?: string | null
          last_sync_at?: string | null
          organization_id?: string
          provider?: string
          sync_frequency?: unknown | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enterprise_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_branches: {
        Row: {
          branch_name: string
          completed_at: string | null
          created_at: string | null
          end_node_id: string | null
          execution_data: Json | null
          id: string
          session_id: string
          start_node_id: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          branch_name: string
          completed_at?: string | null
          created_at?: string | null
          end_node_id?: string | null
          execution_data?: Json | null
          id?: string
          session_id: string
          start_node_id: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          branch_name?: string
          completed_at?: string | null
          created_at?: string | null
          end_node_id?: string | null
          execution_data?: Json | null
          id?: string
          session_id?: string
          start_node_id?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_branches_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workflow_execution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_retries: {
        Row: {
          attempt_number: number
          created_at: string | null
          error_message: string | null
          execution_id: string
          id: string
          retry_at: string
          status: string | null
        }
        Insert: {
          attempt_number: number
          created_at?: string | null
          error_message?: string | null
          execution_id: string
          id?: string
          retry_at: string
          status?: string | null
        }
        Update: {
          attempt_number?: number
          created_at?: string | null
          error_message?: string | null
          execution_id?: string
          id?: string
          retry_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execution_retries_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      forum_posts: {
        Row: {
          author_id: string
          category: string
          content: string
          created_at: string | null
          id: string
          is_locked: boolean | null
          is_pinned: boolean | null
          last_reply_at: string | null
          last_reply_by: string | null
          reply_count: number | null
          tags: string[] | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          author_id: string
          category: string
          content: string
          created_at?: string | null
          id?: string
          is_locked?: boolean | null
          is_pinned?: boolean | null
          last_reply_at?: string | null
          last_reply_by?: string | null
          reply_count?: number | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string
          category?: string
          content?: string
          created_at?: string | null
          id?: string
          is_locked?: boolean | null
          is_pinned?: boolean | null
          last_reply_at?: string | null
          last_reply_by?: string | null
          reply_count?: number | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      forum_replies: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          helpful_count: number | null
          id: string
          is_solution: boolean | null
          post_id: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          is_solution?: boolean | null
          post_id: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          is_solution?: boolean | null
          post_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "forum_replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "forum_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_data_processing: {
        Row: {
          consent_date: string | null
          consent_given: boolean | null
          consent_withdrawn: boolean | null
          consent_withdrawn_date: string | null
          created_at: string | null
          data_categories: string[] | null
          data_subject_id: string | null
          id: string
          legal_basis: string
          organization_id: string
          processing_purpose: string
          retention_period: unknown | null
          updated_at: string | null
        }
        Insert: {
          consent_date?: string | null
          consent_given?: boolean | null
          consent_withdrawn?: boolean | null
          consent_withdrawn_date?: string | null
          created_at?: string | null
          data_categories?: string[] | null
          data_subject_id?: string | null
          id?: string
          legal_basis: string
          organization_id: string
          processing_purpose: string
          retention_period?: unknown | null
          updated_at?: string | null
        }
        Update: {
          consent_date?: string | null
          consent_given?: boolean | null
          consent_withdrawn?: boolean | null
          consent_withdrawn_date?: string | null
          created_at?: string | null
          data_categories?: string[] | null
          data_subject_id?: string | null
          id?: string
          legal_basis?: string
          organization_id?: string
          processing_purpose?: string
          retention_period?: unknown | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_data_processing_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_api_usage: {
        Row: {
          created_at: string | null
          date_hour: string
          endpoint: string
          error_count: number | null
          id: string
          integration_id: string
          method: string
          request_count: number | null
          response_time_ms: number | null
          status_code: number | null
        }
        Insert: {
          created_at?: string | null
          date_hour: string
          endpoint: string
          error_count?: number | null
          id?: string
          integration_id: string
          method: string
          request_count?: number | null
          response_time_ms?: number | null
          status_code?: number | null
        }
        Update: {
          created_at?: string | null
          date_hour?: string
          endpoint?: string
          error_count?: number | null
          id?: string
          integration_id?: string
          method?: string
          request_count?: number | null
          response_time_ms?: number | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_api_usage_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "advanced_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health_checks: {
        Row: {
          check_type: string
          checked_at: string | null
          error_message: string | null
          id: string
          integration_id: string
          response_time_ms: number | null
          status: string
        }
        Insert: {
          check_type: string
          checked_at?: string | null
          error_message?: string | null
          id?: string
          integration_id: string
          response_time_ms?: number | null
          status: string
        }
        Update: {
          check_type?: string
          checked_at?: string | null
          error_message?: string | null
          id?: string
          integration_id?: string
          response_time_ms?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_health_checks_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health_scores: {
        Row: {
          calculated_at: string | null
          error_rate: number | null
          health_score: number
          id: string
          integration_id: string
          last_error_at: string | null
          performance_score: number | null
          reliability_score: number | null
          response_time_avg: number | null
          uptime_percentage: number | null
          user_id: string
        }
        Insert: {
          calculated_at?: string | null
          error_rate?: number | null
          health_score: number
          id?: string
          integration_id: string
          last_error_at?: string | null
          performance_score?: number | null
          reliability_score?: number | null
          response_time_avg?: number | null
          uptime_percentage?: number | null
          user_id: string
        }
        Update: {
          calculated_at?: string | null
          error_rate?: number | null
          health_score?: number
          id?: string
          integration_id?: string
          last_error_at?: string | null
          performance_score?: number | null
          reliability_score?: number | null
          response_time_avg?: number | null
          uptime_percentage?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_health_scores_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_installations: {
        Row: {
          auth_credentials: Json | null
          configuration: Json | null
          created_at: string | null
          id: string
          integration_id: string
          organization_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          version: string
        }
        Insert: {
          auth_credentials?: Json | null
          configuration?: Json | null
          created_at?: string | null
          id?: string
          integration_id: string
          organization_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          version: string
        }
        Update: {
          auth_credentials?: Json | null
          configuration?: Json | null
          created_at?: string | null
          id?: string
          integration_id?: string
          organization_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_installations_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "custom_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_installations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_marketplace: {
        Row: {
          category: string
          configuration_schema: Json | null
          created_at: string | null
          description: string | null
          documentation_url: string | null
          icon_url: string | null
          id: string
          install_count: number | null
          is_featured: boolean | null
          name: string
          pricing_model: string | null
          provider: string
          rating: number | null
          setup_instructions: Json | null
          supported_actions: Json | null
          supported_triggers: Json | null
          updated_at: string | null
        }
        Insert: {
          category: string
          configuration_schema?: Json | null
          created_at?: string | null
          description?: string | null
          documentation_url?: string | null
          icon_url?: string | null
          id?: string
          install_count?: number | null
          is_featured?: boolean | null
          name: string
          pricing_model?: string | null
          provider: string
          rating?: number | null
          setup_instructions?: Json | null
          supported_actions?: Json | null
          supported_triggers?: Json | null
          updated_at?: string | null
        }
        Update: {
          category?: string
          configuration_schema?: Json | null
          created_at?: string | null
          description?: string | null
          documentation_url?: string | null
          icon_url?: string | null
          id?: string
          install_count?: number | null
          is_featured?: boolean | null
          name?: string
          pricing_model?: string | null
          provider?: string
          rating?: number | null
          setup_instructions?: Json | null
          supported_actions?: Json | null
          supported_triggers?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      integration_reviews: {
        Row: {
          created_at: string | null
          id: string
          integration_id: string
          rating: number
          review_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          integration_id: string
          rating: number
          review_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          integration_id?: string
          rating?: number
          review_text?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_reviews_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "custom_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_tests: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          integration_id: string
          logs: string | null
          status: string
          test_name: string
          test_type: string
          version: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          integration_id: string
          logs?: string | null
          status: string
          test_name: string
          test_type: string
          version: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          integration_id?: string
          logs?: string | null
          status?: string
          test_name?: string
          test_type?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_tests_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "custom_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_versions: {
        Row: {
          actions: Json
          changelog: string | null
          configuration_schema: Json
          created_at: string | null
          id: string
          integration_id: string
          is_active: boolean | null
          triggers: Json
          version: string
        }
        Insert: {
          actions: Json
          changelog?: string | null
          configuration_schema: Json
          created_at?: string | null
          id?: string
          integration_id: string
          is_active?: boolean | null
          triggers: Json
          version: string
        }
        Update: {
          actions?: Json
          changelog?: string | null
          configuration_schema?: Json
          created_at?: string | null
          id?: string
          integration_id?: string
          is_active?: boolean | null
          triggers?: Json
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_versions_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "custom_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhooks: {
        Row: {
          created_at: string | null
          events: string[] | null
          id: string
          integration_id: string
          is_active: boolean | null
          last_triggered_at: string | null
          trigger_count: number | null
          webhook_secret: string | null
          webhook_url: string
        }
        Insert: {
          created_at?: string | null
          events?: string[] | null
          id?: string
          integration_id: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          trigger_count?: number | null
          webhook_secret?: string | null
          webhook_url: string
        }
        Update: {
          created_at?: string | null
          events?: string[] | null
          id?: string
          integration_id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          trigger_count?: number | null
          webhook_secret?: string | null
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhooks_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "advanced_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          consecutive_failures: number | null
          created_at: string | null
          disconnect_reason: string | null
          disconnected_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_failure_at: string | null
          last_refresh_attempt: string | null
          last_refresh_success: string | null
          last_token_refresh: string | null
          metadata: Json | null
          provider: string
          provider_plan: string | null
          provider_user_id: string | null
          refresh_token: string | null
          refresh_token_expires_at: string | null
          scopes: string[] | null
          status: string | null
          team_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          disconnect_reason?: string | null
          disconnected_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_refresh_attempt?: string | null
          last_refresh_success?: string | null
          last_token_refresh?: string | null
          metadata?: Json | null
          provider: string
          provider_plan?: string | null
          provider_user_id?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          scopes?: string[] | null
          status?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          consecutive_failures?: number | null
          created_at?: string | null
          disconnect_reason?: string | null
          disconnected_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_refresh_attempt?: string | null
          last_refresh_success?: string | null
          last_token_refresh?: string | null
          metadata?: Json | null
          provider?: string
          provider_plan?: string | null
          provider_user_id?: string | null
          refresh_token?: string | null
          refresh_token_expires_at?: string | null
          scopes?: string[] | null
          status?: string | null
          team_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          billing_reason: string | null
          created_at: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_pdf: string | null
          organization_id: string | null
          status: string
          stripe_invoice_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          billing_reason?: string | null
          created_at?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          organization_id?: string | null
          status: string
          stripe_invoice_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          billing_reason?: string | null
          created_at?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_pdf?: string | null
          organization_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_articles: {
        Row: {
          author_id: string
          category: string
          content: string
          created_at: string | null
          excerpt: string | null
          featured: boolean | null
          helpful_count: number | null
          id: string
          not_helpful_count: number | null
          published_at: string | null
          slug: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          author_id: string
          category: string
          content: string
          created_at?: string | null
          excerpt?: string | null
          featured?: boolean | null
          helpful_count?: number | null
          id?: string
          not_helpful_count?: number | null
          published_at?: string | null
          slug: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          author_id?: string
          category?: string
          content?: string
          created_at?: string | null
          excerpt?: string | null
          featured?: boolean | null
          helpful_count?: number | null
          id?: string
          not_helpful_count?: number | null
          published_at?: string | null
          slug?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      live_execution_events: {
        Row: {
          event_data: Json | null
          event_type: string
          id: string
          node_id: string | null
          session_id: string
          timestamp: string | null
        }
        Insert: {
          event_data?: Json | null
          event_type: string
          id?: string
          node_id?: string | null
          session_id: string
          timestamp?: string | null
        }
        Update: {
          event_data?: Json | null
          event_type?: string
          id?: string
          node_id?: string | null
          session_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_execution_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workflow_execution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      loop_executions: {
        Row: {
          created_at: string | null
          current_item_index: number | null
          id: string
          iteration_count: number | null
          loop_data: Json | null
          max_iterations: number | null
          node_id: string
          session_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          current_item_index?: number | null
          id?: string
          iteration_count?: number | null
          loop_data?: Json | null
          max_iterations?: number | null
          node_id: string
          session_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          current_item_index?: number | null
          id?: string
          iteration_count?: number | null
          loop_data?: Json | null
          max_iterations?: number | null
          node_id?: string
          session_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loop_executions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workflow_execution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      microsoft_graph_delta_tokens: {
        Row: {
          created_at: string
          id: string
          resource_id: string
          resource_type: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_id: string
          resource_type: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_id?: string
          resource_type?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      microsoft_graph_events: {
        Row: {
          created_at: string
          event_action: string
          event_id: string
          event_type: string
          id: string
          payload: Json
          resource_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_action: string
          event_id: string
          event_type: string
          id?: string
          payload: Json
          resource_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_action?: string
          event_id?: string
          event_type?: string
          id?: string
          payload?: Json
          resource_id?: string
          user_id?: string
        }
        Relationships: []
      }
      microsoft_graph_subscriptions: {
        Row: {
          access_token: string
          change_type: string
          client_state: string
          created_at: string
          expiration_date_time: string
          id: string
          notification_url: string
          resource: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          change_type: string
          client_state: string
          created_at?: string
          expiration_date_time: string
          id: string
          notification_url: string
          resource: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          change_type?: string
          client_state?: string
          created_at?: string
          expiration_date_time?: string
          id?: string
          notification_url?: string
          resource?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      microsoft_webhook_dedup: {
        Row: {
          created_at: string
          dedup_key: string
        }
        Insert: {
          created_at?: string
          dedup_key: string
        }
        Update: {
          created_at?: string
          dedup_key?: string
        }
        Relationships: []
      }
      microsoft_webhook_queue: {
        Row: {
          change_type: string
          created_at: string
          error_message: string | null
          headers: Json
          id: string
          payload: Json
          processed_count: number | null
          resource: string
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          error_message?: string | null
          headers: Json
          id?: string
          payload: Json
          processed_count?: number | null
          resource: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          error_message?: string | null
          headers?: Json
          id?: string
          payload?: Json
          processed_count?: number | null
          resource?: string
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "microsoft_webhook_queue_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "microsoft_graph_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_ai_costs: {
        Row: {
          ai_agent_cost: number | null
          ai_assistant_cost: number | null
          ai_compose_cost: number | null
          created_at: string | null
          id: string
          month: number
          total_cost: number | null
          total_tokens: number | null
          updated_at: string | null
          user_id: string | null
          year: number
        }
        Insert: {
          ai_agent_cost?: number | null
          ai_assistant_cost?: number | null
          ai_compose_cost?: number | null
          created_at?: string | null
          id?: string
          month: number
          total_cost?: number | null
          total_tokens?: number | null
          updated_at?: string | null
          user_id?: string | null
          year: number
        }
        Update: {
          ai_agent_cost?: number | null
          ai_assistant_cost?: number | null
          ai_compose_cost?: number | null
          created_at?: string | null
          id?: string
          month?: number
          total_cost?: number | null
          total_tokens?: number | null
          updated_at?: string | null
          user_id?: string | null
          year?: number
        }
        Relationships: []
      }
      monthly_usage: {
        Row: {
          ai_agent_executions: number | null
          ai_assistant_calls: number | null
          ai_compose_uses: number | null
          created_at: string | null
          execution_count: number | null
          id: string
          integration_count: number | null
          month: number
          organization_id: string | null
          storage_used_mb: number | null
          team_member_count: number | null
          updated_at: string | null
          user_id: string
          workflow_count: number | null
          year: number
        }
        Insert: {
          ai_agent_executions?: number | null
          ai_assistant_calls?: number | null
          ai_compose_uses?: number | null
          created_at?: string | null
          execution_count?: number | null
          id?: string
          integration_count?: number | null
          month: number
          organization_id?: string | null
          storage_used_mb?: number | null
          team_member_count?: number | null
          updated_at?: string | null
          user_id: string
          workflow_count?: number | null
          year: number
        }
        Update: {
          ai_agent_executions?: number | null
          ai_assistant_calls?: number | null
          ai_compose_uses?: number | null
          created_at?: string | null
          execution_count?: number | null
          id?: string
          integration_count?: number | null
          month?: number
          organization_id?: string | null
          storage_used_mb?: number | null
          team_member_count?: number | null
          updated_at?: string | null
          user_id?: string
          workflow_count?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          permissions: Json | null
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          permissions?: Json | null
          role?: string
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          permissions?: Json | null
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_address: Json | null
          billing_email: string | null
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          owner_id: string
          settings: Json | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          billing_address?: Json | null
          billing_email?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          owner_id: string
          settings?: Json | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_address?: Json | null
          billing_email?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          settings?: Json | null
          slug?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      package_dependencies: {
        Row: {
          created_at: string | null
          id: string
          is_dev_dependency: boolean | null
          language: string
          library_id: string | null
          package_name: string
          version: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_dev_dependency?: boolean | null
          language: string
          library_id?: string | null
          package_name: string
          version: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_dev_dependency?: boolean | null
          language?: string
          library_id?: string | null
          package_name?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_dependencies_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "custom_code_libraries"
            referencedColumns: ["id"]
          },
        ]
      }
      pkce_flow: {
        Row: {
          code_verifier: string
          created_at: string
          provider: string
          state: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          provider: string
          state: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          provider?: string
          state?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          max_ai_agent_executions: number | null
          max_ai_assistant_calls: number | null
          max_ai_compose_uses: number | null
          max_executions_per_month: number
          max_integrations: number
          max_nodes_per_workflow: number
          max_storage_mb: number
          max_team_members: number
          max_workflows: number
          name: string
          price_monthly: number
          price_yearly: number
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_ai_agent_executions?: number | null
          max_ai_assistant_calls?: number | null
          max_ai_compose_uses?: number | null
          max_executions_per_month: number
          max_integrations: number
          max_nodes_per_workflow: number
          max_storage_mb: number
          max_team_members: number
          max_workflows: number
          name: string
          price_monthly: number
          price_yearly: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_ai_agent_executions?: number | null
          max_ai_assistant_calls?: number | null
          max_ai_compose_uses?: number | null
          max_executions_per_month?: number
          max_integrations?: number
          max_nodes_per_workflow?: number
          max_storage_mb?: number
          max_team_members?: number
          max_workflows?: number
          name?: string
          price_monthly?: number
          price_yearly?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      predictions: {
        Row: {
          actual_outcome: Json | null
          confidence_score: number | null
          created_at: string | null
          id: string
          input_data: Json
          model_id: string
          organization_id: string | null
          outcome_recorded_at: string | null
          prediction_result: Json
          prediction_type: string
          user_id: string
        }
        Insert: {
          actual_outcome?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          input_data: Json
          model_id: string
          organization_id?: string | null
          outcome_recorded_at?: string | null
          prediction_result: Json
          prediction_type: string
          user_id: string
        }
        Update: {
          actual_outcome?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          input_data?: Json
          model_id?: string
          organization_id?: string | null
          outcome_recorded_at?: string | null
          prediction_result?: Json
          prediction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "predictive_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      predictive_models: {
        Row: {
          accuracy_score: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_trained_at: string | null
          model_config: Json
          model_name: string
          model_type: string
          training_data: Json | null
          updated_at: string | null
        }
        Insert: {
          accuracy_score?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_trained_at?: string | null
          model_config: Json
          model_name: string
          model_type: string
          training_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          accuracy_score?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_trained_at?: string | null
          model_config?: Json
          model_name?: string
          model_type?: string
          training_data?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          duration: string | null
          duration_months: number | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_redemptions: number | null
          redemption_count: number | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          duration?: string | null
          duration_months?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_redemptions?: number | null
          redemption_count?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          duration?: string | null
          duration_months?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_redemptions?: number | null
          redemption_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      report_generations: {
        Row: {
          error_message: string | null
          file_type: string | null
          file_url: string | null
          generated_at: string | null
          generated_by: string | null
          generation_status: string | null
          id: string
          report_id: string
        }
        Insert: {
          error_message?: string | null
          file_type?: string | null
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          generation_status?: string | null
          id?: string
          report_id: string
        }
        Update: {
          error_message?: string | null
          file_type?: string | null
          file_url?: string | null
          generated_at?: string | null
          generated_by?: string | null
          generation_status?: string | null
          id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_generations_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "automated_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      roi_calculations: {
        Row: {
          calculated_at: string | null
          calculation_period_end: string | null
          calculation_period_start: string | null
          cost_saved_amount: number | null
          id: string
          implementation_cost: number | null
          organization_id: string | null
          revenue_generated: number | null
          roi_percentage: number | null
          time_saved_hours: number | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          calculated_at?: string | null
          calculation_period_end?: string | null
          calculation_period_start?: string | null
          cost_saved_amount?: number | null
          id?: string
          implementation_cost?: number | null
          organization_id?: string | null
          revenue_generated?: number | null
          roi_percentage?: number | null
          time_saved_hours?: number | null
          user_id: string
          workflow_id: string
        }
        Update: {
          calculated_at?: string | null
          calculation_period_end?: string | null
          calculation_period_start?: string | null
          cost_saved_amount?: number | null
          id?: string
          implementation_cost?: number | null
          organization_id?: string | null
          revenue_generated?: number | null
          roi_percentage?: number | null
          time_saved_hours?: number | null
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roi_calculations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roi_calculations_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_environments: {
        Row: {
          base_image: string
          created_at: string | null
          environment_name: string
          environment_variables: Json | null
          id: string
          installed_packages: Json | null
          is_active: boolean | null
          language: string
          resource_limits: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          base_image: string
          created_at?: string | null
          environment_name: string
          environment_variables?: Json | null
          id?: string
          installed_packages?: Json | null
          is_active?: boolean | null
          language: string
          resource_limits?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          base_image?: string
          created_at?: string | null
          environment_name?: string
          environment_variables?: Json | null
          id?: string
          installed_packages?: Json | null
          is_active?: boolean | null
          language?: string
          resource_limits?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scheduled_workflow_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_node_id: string
          error_message: string | null
          execution_context: Json | null
          id: string
          input_data: Json | null
          max_retries: number | null
          next_node_id: string | null
          processed_at: string | null
          retry_count: number | null
          schedule_type: string | null
          scheduled_for: string
          status: string | null
          updated_at: string | null
          user_id: string | null
          wait_config: Json | null
          workflow_execution_id: string | null
          workflow_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_node_id: string
          error_message?: string | null
          execution_context?: Json | null
          id?: string
          input_data?: Json | null
          max_retries?: number | null
          next_node_id?: string | null
          processed_at?: string | null
          retry_count?: number | null
          schedule_type?: string | null
          scheduled_for: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          wait_config?: Json | null
          workflow_execution_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_node_id?: string
          error_message?: string | null
          execution_context?: Json | null
          id?: string
          input_data?: Json | null
          max_retries?: number | null
          next_node_id?: string | null
          processed_at?: string | null
          retry_count?: number | null
          schedule_type?: string | null
          scheduled_for?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          wait_config?: Json | null
          workflow_execution_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_workflow_executions_workflow_execution_id_fkey"
            columns: ["workflow_execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      security_incidents: {
        Row: {
          affected_resources: Json | null
          assigned_to: string | null
          created_at: string | null
          description: string
          detection_method: string | null
          id: string
          incident_type: string
          organization_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          severity: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          affected_resources?: Json | null
          assigned_to?: string | null
          created_at?: string | null
          description: string
          detection_method?: string | null
          id?: string
          incident_type: string
          organization_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_resources?: Json | null
          assigned_to?: string | null
          created_at?: string | null
          description?: string
          detection_method?: string | null
          id?: string
          incident_type?: string
          organization_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_incidents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_configurations: {
        Row: {
          certificate: string | null
          configuration: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          metadata_url: string | null
          organization_id: string
          provider: string
          provider_name: string
          updated_at: string | null
        }
        Insert: {
          certificate?: string | null
          configuration: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata_url?: string | null
          organization_id: string
          provider: string
          provider_name: string
          updated_at?: string | null
        }
        Update: {
          certificate?: string | null
          configuration?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata_url?: string | null
          organization_id?: string
          provider?: string
          provider_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sso_configurations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          billing_cycle: string | null
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          organization_id: string | null
          plan_id: string
          quantity: number | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_cycle?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string | null
          plan_id: string
          quantity?: number | null
          status: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_cycle?: string | null
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          organization_id?: string | null
          plan_id?: string
          quantity?: number | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_responses: {
        Row: {
          attachments: Json | null
          created_at: string | null
          id: string
          internal_notes: string | null
          is_staff_response: boolean
          message: string
          ticket_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          attachments?: Json | null
          created_at?: string | null
          id?: string
          internal_notes?: string | null
          is_staff_response?: boolean
          message: string
          ticket_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          attachments?: Json | null
          created_at?: string | null
          id?: string
          internal_notes?: string | null
          is_staff_response?: boolean
          message?: string
          ticket_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_responses_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          attachments: Json | null
          browser_info: Json | null
          category: string
          closed_at: string | null
          created_at: string | null
          description: string
          error_details: Json | null
          id: string
          internal_notes: string | null
          priority: string
          resolution: string | null
          resolved_at: string | null
          status: string
          subject: string
          system_info: Json | null
          tags: string[] | null
          ticket_number: string
          updated_at: string | null
          user_email: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json | null
          browser_info?: Json | null
          category?: string
          closed_at?: string | null
          created_at?: string | null
          description: string
          error_details?: Json | null
          id?: string
          internal_notes?: string | null
          priority?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          subject: string
          system_info?: Json | null
          tags?: string[] | null
          ticket_number: string
          updated_at?: string | null
          user_email: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json | null
          browser_info?: Json | null
          category?: string
          closed_at?: string | null
          created_at?: string | null
          description?: string
          error_details?: Json | null
          id?: string
          internal_notes?: string | null
          priority?: string
          resolution?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          system_info?: Json | null
          tags?: string[] | null
          ticket_number?: string
          updated_at?: string | null
          user_email?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      team_members: {
        Row: {
          id: string
          joined_at: string | null
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_templates: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          shared_with_teams: string[] | null
          team_id: string
          template_data: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          shared_with_teams?: string[] | null
          team_id: string
          template_data: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          shared_with_teams?: string[] | null
          team_id?: string
          template_data?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_workflows: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          shared_with_teams: string[] | null
          team_id: string
          updated_at: string | null
          workflow_data: Json
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          shared_with_teams?: string[] | null
          team_id: string
          updated_at?: string | null
          workflow_data: Json
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          shared_with_teams?: string[] | null
          team_id?: string
          updated_at?: string | null
          workflow_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "team_workflows_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_downloads: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string | null
          template_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          template_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_downloads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_downloads_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_reviews: {
        Row: {
          created_at: string | null
          id: string
          rating: number
          review_text: string | null
          template_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          rating: number
          review_text?: string | null
          template_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          rating?: number
          review_text?: string | null
          template_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_reviews_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean | null
          name: string
          tags: string[] | null
          updated_at: string | null
          workflow_json: Json
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          tags?: string[] | null
          updated_at?: string | null
          workflow_json: Json
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          tags?: string[] | null
          updated_at?: string | null
          workflow_json?: Json
        }
        Relationships: []
      }
      token_audit_logs: {
        Row: {
          created_at: string | null
          event_details: Json | null
          event_type: string
          id: string
          integration_id: string | null
          ip_address: unknown | null
          provider: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_details?: Json | null
          event_type: string
          id?: string
          integration_id?: string | null
          ip_address?: unknown | null
          provider: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_details?: Json | null
          event_type?: string
          id?: string
          integration_id?: string | null
          ip_address?: unknown | null
          provider?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_audit_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      token_refresh_logs: {
        Row: {
          created_at: string | null
          duration_ms: number
          error_count: number
          errors: Json | null
          executed_at: string
          failed_refreshes: number
          id: string
          is_critical_failure: boolean | null
          job_id: string | null
          skipped_refreshes: number
          status: string | null
          successful_refreshes: number
          total_processed: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          duration_ms: number
          error_count?: number
          errors?: Json | null
          executed_at: string
          failed_refreshes?: number
          id?: string
          is_critical_failure?: boolean | null
          job_id?: string | null
          skipped_refreshes?: number
          status?: string | null
          successful_refreshes?: number
          total_processed?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          duration_ms?: number
          error_count?: number
          errors?: Json | null
          executed_at?: string
          failed_refreshes?: number
          id?: string
          is_critical_failure?: boolean | null
          job_id?: string | null
          skipped_refreshes?: number
          status?: string | null
          successful_refreshes?: number
          total_processed?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      tutorial_progress: {
        Row: {
          completed: boolean | null
          completed_at: string | null
          created_at: string | null
          data: Json | null
          id: string
          step_id: string
          tutorial_id: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          step_id: string
          tutorial_id: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completed_at?: string | null
          created_at?: string | null
          data?: Json | null
          id?: string
          step_id?: string
          tutorial_id?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          metadata: Json | null
          organization_id: string | null
          quantity: number | null
          resource_id: string | null
          resource_type: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          quantity?: number | null
          resource_id?: string | null
          resource_type: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          quantity?: number | null
          resource_id?: string | null
          resource_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_bases: {
        Row: {
          base_id: string
          created_at: string | null
          name: string | null
          provider: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          base_id: string
          created_at?: string | null
          name?: string | null
          provider: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          base_id?: string
          created_at?: string | null
          name?: string | null
          provider?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_config_preferences: {
        Row: {
          created_at: string | null
          field_name: string
          field_type: string
          field_value: string | null
          id: string
          is_default: boolean | null
          node_type: string
          provider_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          field_name: string
          field_type?: string
          field_value?: string | null
          id?: string
          is_default?: boolean | null
          node_type: string
          provider_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          field_name?: string
          field_type?: string
          field_value?: string | null
          id?: string
          is_default?: boolean | null
          node_type?: string
          provider_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding: {
        Row: {
          completed_at: string | null
          completed_steps: string[] | null
          created_at: string | null
          current_step: string | null
          id: string
          is_completed: boolean | null
          onboarding_data: Json | null
          skipped_steps: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_steps?: string[] | null
          created_at?: string | null
          current_step?: string | null
          id?: string
          is_completed?: boolean | null
          onboarding_data?: Json | null
          skipped_steps?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_steps?: string[] | null
          created_at?: string | null
          current_step?: string | null
          id?: string
          is_completed?: boolean | null
          onboarding_data?: Json | null
          skipped_steps?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_presence: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          last_seen: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          last_seen?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          last_seen?: string | null
          role?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          created_at: string | null
          first_name: string | null
          full_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          phone_number: string | null
          provider: string | null
          role: string | null
          secondary_email: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          last_name?: string | null
          phone_number?: string | null
          provider?: string | null
          role?: string | null
          secondary_email?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          phone_number?: string | null
          provider?: string | null
          role?: string | null
          secondary_email?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: []
      }
      user_video_progress: {
        Row: {
          completed: boolean | null
          id: string
          last_watched_at: string | null
          progress_seconds: number | null
          user_id: string
          video_id: string
        }
        Insert: {
          completed?: boolean | null
          id?: string
          last_watched_at?: string | null
          progress_seconds?: number | null
          user_id: string
          video_id: string
        }
        Update: {
          completed?: boolean | null
          id?: string
          last_watched_at?: string | null
          progress_seconds?: number | null
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_video_progress_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "video_tutorials"
            referencedColumns: ["id"]
          },
        ]
      }
      video_tutorials: {
        Row: {
          category: string
          created_at: string | null
          created_by: string
          description: string | null
          difficulty_level: string | null
          duration_seconds: number | null
          id: string
          is_featured: boolean | null
          like_count: number | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_url: string
          view_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by: string
          description?: string | null
          difficulty_level?: string | null
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean | null
          like_count?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_url: string
          view_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          difficulty_level?: string | null
          duration_seconds?: number | null
          id?: string
          is_featured?: boolean | null
          like_count?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string
          view_count?: number | null
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          config: Json | null
          created_at: string | null
          error_count: number | null
          id: string
          last_triggered: string | null
          provider_id: string
          secret: string | null
          status: string | null
          trigger_type: string
          updated_at: string | null
          user_id: string | null
          webhook_url: string
          workflow_id: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          error_count?: number | null
          id?: string
          last_triggered?: string | null
          provider_id: string
          secret?: string | null
          status?: string | null
          trigger_type: string
          updated_at?: string | null
          user_id?: string | null
          webhook_url: string
          workflow_id?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          error_count?: number | null
          id?: string
          last_triggered?: string | null
          provider_id?: string
          secret?: string | null
          status?: string | null
          trigger_type?: string
          updated_at?: string | null
          user_id?: string | null
          webhook_url?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt_count: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          status: string
          status_code: number | null
          webhook_id: string
        }
        Insert: {
          attempt_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          status: string
          status_code?: number | null
          webhook_id: string
        }
        Update: {
          attempt_count?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          status?: string
          status_code?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhook_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_event_logs: {
        Row: {
          created_at: string | null
          error: string | null
          event_data: Json | null
          event_type: string | null
          headers: Json | null
          id: string
          method: string | null
          processing_time_ms: number | null
          provider: string
          request_id: string
          result: Json | null
          service: string | null
          status: string | null
          timestamp: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          event_data?: Json | null
          event_type?: string | null
          headers?: Json | null
          id?: string
          method?: string | null
          processing_time_ms?: number | null
          provider: string
          request_id: string
          result?: Json | null
          service?: string | null
          status?: string | null
          timestamp?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          event_data?: Json | null
          event_type?: string | null
          headers?: Json | null
          id?: string
          method?: string | null
          processing_time_ms?: number | null
          provider?: string
          request_id?: string
          result?: Json | null
          service?: string | null
          status?: string | null
          timestamp?: string | null
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string | null
          event_data: Json
          id: string
          provider: string
          request_id: string
          service: string | null
          status: string | null
          timestamp: string | null
        }
        Insert: {
          created_at?: string | null
          event_data: Json
          id?: string
          provider: string
          request_id: string
          service?: string | null
          status?: string | null
          timestamp?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json
          id?: string
          provider?: string
          request_id?: string
          service?: string | null
          status?: string | null
          timestamp?: string | null
        }
        Relationships: []
      }
      webhook_executions: {
        Row: {
          created_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          headers: Json | null
          id: string
          payload: Json
          provider_id: string
          status: string
          trigger_type: string
          user_id: string | null
          webhook_id: string | null
          workflow_id: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          headers?: Json | null
          id?: string
          payload: Json
          provider_id: string
          status: string
          trigger_type: string
          user_id?: string | null
          webhook_id?: string | null
          workflow_id?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          headers?: Json | null
          id?: string
          payload?: Json
          provider_id?: string
          status?: string
          trigger_type?: string
          user_id?: string | null
          webhook_id?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_executions_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhook_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_registrations: {
        Row: {
          channel_id: string | null
          created_at: string | null
          events: string[]
          external_webhook_id: string | null
          external_webhook_token: string | null
          id: string
          metadata: Json | null
          provider: string
          secret: string | null
          status: string | null
          updated_at: string | null
          webhook_url: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string | null
          events?: string[]
          external_webhook_id?: string | null
          external_webhook_token?: string | null
          id?: string
          metadata?: Json | null
          provider: string
          secret?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string | null
          events?: string[]
          external_webhook_id?: string | null
          external_webhook_token?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          secret?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      webhook_subscriptions: {
        Row: {
          created_at: string | null
          event_types: string[]
          failure_count: number | null
          headers: Json | null
          id: string
          is_active: boolean | null
          last_failure_at: string | null
          last_success_at: string | null
          name: string
          organization_id: string | null
          secret_key: string | null
          target_url: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_types: string[]
          failure_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_success_at?: string | null
          name: string
          organization_id?: string | null
          secret_key?: string | null
          target_url: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_types?: string[]
          failure_count?: number | null
          headers?: Json | null
          id?: string
          is_active?: boolean | null
          last_failure_at?: string | null
          last_success_at?: string | null
          name?: string
          organization_id?: string | null
          secret_key?: string | null
          target_url?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error: string | null
          event_data: Json
          event_type: string | null
          failed_at: string | null
          id: string
          priority: string | null
          provider: string
          request_id: string
          result: Json | null
          service: string | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error?: string | null
          event_data: Json
          event_type?: string | null
          failed_at?: string | null
          id?: string
          priority?: string | null
          provider: string
          request_id: string
          result?: Json | null
          service?: string | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error?: string | null
          event_data?: Json
          event_type?: string | null
          failed_at?: string | null
          id?: string
          priority?: string | null
          provider?: string
          request_id?: string
          result?: Json | null
          service?: string | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      workflow_alerts: {
        Row: {
          acknowledged: boolean | null
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_data: Json | null
          alert_type: string
          created_at: string | null
          id: string
          message: string
          severity: string
          workflow_id: string
        }
        Insert: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_data?: Json | null
          alert_type: string
          created_at?: string | null
          id?: string
          message: string
          severity: string
          workflow_id: string
        }
        Update: {
          acknowledged?: boolean | null
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_data?: Json | null
          alert_type?: string
          created_at?: string | null
          id?: string
          message?: string
          severity?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_alerts_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_benchmarks: {
        Row: {
          benchmark_type: string
          configuration: Json
          created_at: string | null
          created_by: string
          id: string
          results: Json
          workflow_id: string
        }
        Insert: {
          benchmark_type: string
          configuration: Json
          created_at?: string | null
          created_by: string
          id?: string
          results: Json
          workflow_id: string
        }
        Update: {
          benchmark_type?: string
          configuration?: Json
          created_at?: string | null
          created_by?: string
          id?: string
          results?: Json
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_benchmarks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_builder_preferences: {
        Row: {
          auto_save: boolean | null
          created_at: string | null
          grid_enabled: boolean | null
          id: string
          minimap_enabled: boolean | null
          pan_position: Json | null
          sidebar_collapsed: boolean | null
          snap_to_grid: boolean | null
          theme: string | null
          updated_at: string | null
          user_id: string
          zoom_level: number | null
        }
        Insert: {
          auto_save?: boolean | null
          created_at?: string | null
          grid_enabled?: boolean | null
          id?: string
          minimap_enabled?: boolean | null
          pan_position?: Json | null
          sidebar_collapsed?: boolean | null
          snap_to_grid?: boolean | null
          theme?: string | null
          updated_at?: string | null
          user_id: string
          zoom_level?: number | null
        }
        Update: {
          auto_save?: boolean | null
          created_at?: string | null
          grid_enabled?: boolean | null
          id?: string
          minimap_enabled?: boolean | null
          pan_position?: Json | null
          sidebar_collapsed?: boolean | null
          snap_to_grid?: boolean | null
          theme?: string | null
          updated_at?: string | null
          user_id?: string
          zoom_level?: number | null
        }
        Relationships: []
      }
      workflow_changes: {
        Row: {
          applied: boolean | null
          change_data: Json
          change_timestamp: string | null
          change_type: string
          conflict_resolution: Json | null
          id: string
          user_id: string
          version_hash: string | null
          workflow_id: string
        }
        Insert: {
          applied?: boolean | null
          change_data: Json
          change_timestamp?: string | null
          change_type: string
          conflict_resolution?: Json | null
          id?: string
          user_id: string
          version_hash?: string | null
          workflow_id: string
        }
        Update: {
          applied?: boolean | null
          change_data?: Json
          change_timestamp?: string | null
          change_type?: string
          conflict_resolution?: Json | null
          id?: string
          user_id?: string
          version_hash?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_changes_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_comments: {
        Row: {
          comment_text: string
          comment_type: string | null
          created_at: string | null
          id: string
          is_resolved: boolean | null
          node_id: string | null
          position: Json | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          comment_text: string
          comment_type?: string | null
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          node_id?: string | null
          position?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
          user_id: string
          workflow_id: string
        }
        Update: {
          comment_text?: string
          comment_type?: string | null
          created_at?: string | null
          id?: string
          is_resolved?: boolean | null
          node_id?: string | null
          position?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string | null
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_comments_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_compositions: {
        Row: {
          child_workflow_id: string
          created_at: string | null
          execution_order: number | null
          id: string
          input_mapping: Json | null
          is_parallel: boolean | null
          node_id: string
          output_mapping: Json | null
          parent_workflow_id: string
        }
        Insert: {
          child_workflow_id: string
          created_at?: string | null
          execution_order?: number | null
          id?: string
          input_mapping?: Json | null
          is_parallel?: boolean | null
          node_id: string
          output_mapping?: Json | null
          parent_workflow_id: string
        }
        Update: {
          child_workflow_id?: string
          created_at?: string | null
          execution_order?: number | null
          id?: string
          input_mapping?: Json | null
          is_parallel?: boolean | null
          node_id?: string
          output_mapping?: Json | null
          parent_workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_compositions_child_workflow_id_fkey"
            columns: ["child_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_compositions_parent_workflow_id_fkey"
            columns: ["parent_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_connections: {
        Row: {
          animated: boolean | null
          connection_id: string
          created_at: string | null
          id: string
          source_handle: string | null
          source_node_id: string
          style: Json | null
          target_handle: string | null
          target_node_id: string
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          animated?: boolean | null
          connection_id: string
          created_at?: string | null
          id?: string
          source_handle?: string | null
          source_node_id: string
          style?: Json | null
          target_handle?: string | null
          target_node_id: string
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          animated?: boolean | null
          connection_id?: string
          created_at?: string | null
          id?: string
          source_handle?: string | null
          source_node_id?: string
          style?: Json | null
          target_handle?: string | null
          target_node_id?: string
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_connections_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_debug_sessions: {
        Row: {
          breakpoints: Json | null
          debug_data: Json | null
          ended_at: string | null
          execution_id: string | null
          id: string
          started_at: string | null
          status: string | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          breakpoints?: Json | null
          debug_data?: Json | null
          ended_at?: string | null
          execution_id?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          user_id: string
          workflow_id: string
        }
        Update: {
          breakpoints?: Json | null
          debug_data?: Json | null
          ended_at?: string | null
          execution_id?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_debug_sessions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_dependencies: {
        Row: {
          created_at: string | null
          dependency_config: Json | null
          dependency_name: string
          dependency_type: string
          health_check_url: string | null
          health_status: string | null
          id: string
          is_critical: boolean | null
          last_health_check: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          dependency_config?: Json | null
          dependency_name: string
          dependency_type: string
          health_check_url?: string | null
          health_status?: string | null
          id?: string
          is_critical?: boolean | null
          last_health_check?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          dependency_config?: Json | null
          dependency_name?: string
          dependency_type?: string
          health_check_url?: string | null
          health_status?: string | null
          id?: string
          is_critical?: boolean | null
          last_health_check?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_dependencies_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_execution_sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_step: string | null
          execution_context: Json | null
          id: string
          parallel_branches: Json | null
          progress_percentage: number | null
          session_type: string | null
          started_at: string | null
          status: string | null
          user_id: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          execution_context?: Json | null
          id?: string
          parallel_branches?: Json | null
          progress_percentage?: number | null
          session_type?: string | null
          started_at?: string | null
          status?: string | null
          user_id: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: string | null
          execution_context?: Json | null
          id?: string
          parallel_branches?: Json | null
          progress_percentage?: number | null
          session_type?: string | null
          started_at?: string | null
          status?: string | null
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_execution_sessions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          completed_at: string | null
          error_message: string | null
          execution_time_ms: number | null
          id: string
          input_data: Json | null
          output_data: Json | null
          started_at: string | null
          status: string | null
          user_id: string
          workflow_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          user_id: string
          workflow_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          execution_time_ms?: number | null
          id?: string
          input_data?: Json | null
          output_data?: Json | null
          started_at?: string | null
          status?: string | null
          user_id?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_files: {
        Row: {
          created_at: string | null
          expires_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string | null
          node_id: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type?: string | null
          node_id: string
          user_id: string
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string | null
          node_id?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_files_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "workflow_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_files_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_locks: {
        Row: {
          acquired_at: string | null
          expires_at: string | null
          id: string
          lock_type: string
          resource_id: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          acquired_at?: string | null
          expires_at?: string | null
          id?: string
          lock_type: string
          resource_id: string
          user_id: string
          workflow_id: string
        }
        Update: {
          acquired_at?: string | null
          expires_at?: string | null
          id?: string
          lock_type?: string
          resource_id?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_locks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_node_executions: {
        Row: {
          completed_at: string | null
          error_message: string | null
          execution_id: string | null
          id: string
          input_data: Json | null
          node_id: string
          node_type: string
          output_data: Json | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          input_data?: Json | null
          node_id: string
          node_type: string
          output_data?: Json | null
          started_at?: string | null
          status: string
        }
        Update: {
          completed_at?: string | null
          error_message?: string | null
          execution_id?: string | null
          id?: string
          input_data?: Json | null
          node_id?: string
          node_type?: string
          output_data?: Json | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_node_executions_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "workflow_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_nodes: {
        Row: {
          config: Json | null
          created_at: string | null
          description: string | null
          display_order: number | null
          height: number | null
          id: string
          is_trigger: boolean | null
          node_type: string
          position_x: number
          position_y: number
          provider_id: string | null
          title: string | null
          updated_at: string | null
          width: number | null
          workflow_id: string
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          height?: number | null
          id?: string
          is_trigger?: boolean | null
          node_type: string
          position_x: number
          position_y: number
          provider_id?: string | null
          title?: string | null
          updated_at?: string | null
          width?: number | null
          workflow_id: string
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          height?: number | null
          id?: string
          is_trigger?: boolean | null
          node_type?: string
          position_x?: number
          position_y?: number
          provider_id?: string | null
          title?: string | null
          updated_at?: string | null
          width?: number | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_nodes_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_optimizations: {
        Row: {
          analysis_data: Json
          analyzed_at: string | null
          analyzed_by: string
          id: string
          optimization_score: number | null
          suggestions: Json | null
          workflow_id: string
        }
        Insert: {
          analysis_data: Json
          analyzed_at?: string | null
          analyzed_by: string
          id?: string
          optimization_score?: number | null
          suggestions?: Json | null
          workflow_id: string
        }
        Update: {
          analysis_data?: Json
          analyzed_at?: string | null
          analyzed_by?: string
          id?: string
          optimization_score?: number | null
          suggestions?: Json | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_optimizations_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_schedules: {
        Row: {
          created_at: string | null
          cron_expression: string
          enabled: boolean | null
          id: string
          last_run: string | null
          next_run: string | null
          timezone: string | null
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          cron_expression: string
          enabled?: boolean | null
          id?: string
          last_run?: string | null
          next_run?: string | null
          timezone?: string | null
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          cron_expression?: string
          enabled?: boolean | null
          id?: string
          last_run?: string | null
          next_run?: string | null
          timezone?: string | null
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_schedules_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_shares: {
        Row: {
          created_at: string | null
          id: string
          permission: string | null
          shared_by: string | null
          shared_with: string | null
          workflow_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          permission?: string | null
          shared_by?: string | null
          shared_with?: string | null
          workflow_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          permission?: string | null
          shared_by?: string | null
          shared_with?: string | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_shares_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_snapshots: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          snapshot_data: Json
          snapshot_type: string | null
          version_id: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          snapshot_data: Json
          snapshot_type?: string | null
          version_id?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          snapshot_data?: Json
          snapshot_type?: string | null
          version_id?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_snapshots_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_snapshots_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          author_id: string
          category: string | null
          configuration: Json | null
          connections: Json
          created_at: string | null
          description: string | null
          downloads_count: number | null
          id: string
          is_featured: boolean | null
          is_public: boolean | null
          name: string
          nodes: Json
          organization_id: string | null
          rating_average: number | null
          rating_count: number | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string | null
          variables: Json | null
          version: string | null
        }
        Insert: {
          author_id: string
          category?: string | null
          configuration?: Json | null
          connections?: Json
          created_at?: string | null
          description?: string | null
          downloads_count?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          name: string
          nodes?: Json
          organization_id?: string | null
          rating_average?: number | null
          rating_count?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          variables?: Json | null
          version?: string | null
        }
        Update: {
          author_id?: string
          category?: string | null
          configuration?: Json | null
          connections?: Json
          created_at?: string | null
          description?: string | null
          downloads_count?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          name?: string
          nodes?: Json
          organization_id?: string | null
          rating_average?: number | null
          rating_count?: number | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string | null
          variables?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_test_runs: {
        Row: {
          executed_at: string | null
          executed_by: string | null
          id: string
          results: Json
          test_suite_id: string
        }
        Insert: {
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          results: Json
          test_suite_id: string
        }
        Update: {
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          results?: Json
          test_suite_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_test_runs_test_suite_id_fkey"
            columns: ["test_suite_id"]
            isOneToOne: false
            referencedRelation: "workflow_test_suites"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_test_suites: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          name: string
          test_cases: Json | null
          updated_at: string | null
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          name: string
          test_cases?: Json | null
          updated_at?: string | null
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          test_cases?: Json | null
          updated_at?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_test_suites_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_variables: {
        Row: {
          created_at: string | null
          id: string
          name: string
          type: string
          updated_at: string | null
          value: Json
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          type?: string
          updated_at?: string | null
          value: Json
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string | null
          value?: Json
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_variables_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_versions: {
        Row: {
          connections: Json
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_published: boolean | null
          nodes: Json
          parent_version_id: string | null
          variables: Json | null
          version_name: string | null
          version_number: number
          workflow_id: string
        }
        Insert: {
          connections: Json
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          nodes: Json
          parent_version_id?: string | null
          variables?: Json | null
          version_name?: string | null
          version_number: number
          workflow_id: string
        }
        Update: {
          connections?: Json
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_published?: boolean | null
          nodes?: Json
          parent_version_id?: string | null
          variables?: Json | null
          version_name?: string | null
          version_number?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "workflow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_versions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          connections: Json | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          nodes: Json | null
          organization_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          connections?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          nodes?: Json | null
          organization_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          connections?: Json | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          nodes?: Json | null
          organization_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      integration_health_summary: {
        Row: {
          expires_at: string | null
          health_status: string | null
          id: string | null
          last_refreshed_at: string | null
          last_used_at: string | null
          provider: string | null
          recent_failures: number | null
          status: string | null
          user_id: string | null
        }
        Relationships: []
      }
      token_health_summary: {
        Row: {
          avg_failures: number | null
          expired: number | null
          expiring_soon: number | null
          failed: number | null
          healthy: number | null
          provider: string | null
          total_integrations: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      bytea_to_text: {
        Args: { data: string }
        Returns: string
      }
      call_token_refresh: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      check_user_role_permission: {
        Args: { required_role: string; user_id: string }
        Returns: boolean
      }
      check_workflow_health: {
        Args: { workflow_id_param: string }
        Returns: {
          dependency_name: string
          health_status: string
          last_checked: string
        }[]
      }
      clean_microsoft_webhook_dedup: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      clean_microsoft_webhook_queue: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_expired_invitations: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_expired_tokens: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_old_audit_logs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_executions: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_token_logs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_old_webhook_data: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      cleanup_orphaned_webhooks: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      create_notification: {
        Args: {
          p_action_url?: string
          p_expires_at?: string
          p_message: string
          p_metadata?: Json
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      generate_ticket_number: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_integration_usage_stats: {
        Args: { days_back?: number; integration_id_param: string }
        Returns: {
          avg_response_time: number
          error_rate: number
          most_used_endpoint: string
          total_requests: number
        }[]
      }
      get_workflow_performance_metrics: {
        Args: { days_back?: number; workflow_id_param: string }
        Returns: {
          avg_execution_time: number
          error_count: number
          success_rate: number
          total_executions: number
        }[]
      }
      http: {
        Args: { request: Database["public"]["CompositeTypes"]["http_request"] }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_delete: {
        Args:
          | { content: string; content_type: string; uri: string }
          | { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_get: {
        Args: { data: Json; uri: string } | { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_head: {
        Args: { uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_header: {
        Args: { field: string; value: string }
        Returns: Database["public"]["CompositeTypes"]["http_header"]
      }
      http_list_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: {
          curlopt: string
          value: string
        }[]
      }
      http_patch: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_post: {
        Args:
          | { content: string; content_type: string; uri: string }
          | { data: Json; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_put: {
        Args: { content: string; content_type: string; uri: string }
        Returns: Database["public"]["CompositeTypes"]["http_response"]
      }
      http_reset_curlopt: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      http_set_curlopt: {
        Args: { curlopt: string; value: string }
        Returns: boolean
      }
      log_token_event: {
        Args: {
          p_event_details?: Json
          p_event_type: string
          p_integration_id: string
          p_ip_address?: unknown
          p_provider: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: string
      }
      mark_integration_used: {
        Args: { p_integration_id: string }
        Returns: boolean
      }
      refresh_tokens: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      text_to_bytea: {
        Args: { data: string }
        Returns: string
      }
      trigger_cleanup: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      update_integration_status: {
        Args: { p_integration_id: string; p_metadata?: Json; p_status: string }
        Returns: boolean
      }
      urlencode: {
        Args: { data: Json } | { string: string } | { string: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      http_header: {
        field: string | null
        value: string | null
      }
      http_request: {
        method: unknown | null
        uri: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content_type: string | null
        content: string | null
      }
      http_response: {
        status: number | null
        content_type: string | null
        headers: Database["public"]["CompositeTypes"]["http_header"][] | null
        content: string | null
      }
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
  public: {
    Enums: {},
  },
} as const
