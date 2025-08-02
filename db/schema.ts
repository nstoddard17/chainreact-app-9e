// Required named exports for db/schema.ts
export const users = {
  tableName: "users",
  columns: {
    id: "id",
    email: "email",
    name: "name",
    image: "image",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

export const accounts = {
  tableName: "accounts",
  columns: {
    id: "id",
    user_id: "user_id",
    provider: "provider",
    provider_account_id: "provider_account_id",
    access_token: "access_token",
    refresh_token: "refresh_token",
    expires_at: "expires_at",
    token_type: "token_type",
    scope: "scope",
    id_token: "id_token",
    session_state: "session_state",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

export const sessions = {
  tableName: "sessions",
  columns: {
    id: "id",
    user_id: "user_id",
    session_token: "session_token",
    expires: "expires",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

export const integrations = {
  tableName: "integrations",
  columns: {
    id: "id",
    user_id: "user_id",
    provider: "provider",
    provider_user_id: "provider_user_id",
    access_token: "access_token",
    refresh_token: "refresh_token",
    expires_at: "expires_at",
    refresh_token_expires_at: "refresh_token_expires_at",
    scopes: "scopes",
    metadata: "metadata",
    status: "status",
    created_at: "created_at",
    updated_at: "updated_at",
    is_active: "is_active",
    last_token_refresh: "last_token_refresh",
    consecutive_failures: "consecutive_failures",
    disconnected_at: "disconnected_at",
    disconnect_reason: "disconnect_reason",
  },
}

export const emailFrequencyCache = {
  tableName: "email_frequency_cache",
  columns: {
    id: "id",
    user_id: "user_id",
    email: "email",
    name: "name",
    frequency: "frequency",
    last_used: "last_used",
    source: "source",
    integration_id: "integration_id",
    metadata: "metadata",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

export const workflowExecutions = {
  tableName: "workflow_executions",
  columns: {
    id: "id",
    workflow_id: "workflow_id",
    user_id: "user_id",
    status: "status",
    input_data: "input_data",
    output_data: "output_data",
    error_message: "error_message",
    started_at: "started_at",
    completed_at: "completed_at",
    execution_time_ms: "execution_time_ms",
    retry_count: "retry_count",
    metadata: "metadata",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

// Type definitions
export interface User {
  id: string
  email: string
  name?: string
  image?: string
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  user_id: string
  provider: string
  provider_account_id: string
  access_token?: string
  refresh_token?: string
  expires_at?: number
  token_type?: string
  scope?: string
  id_token?: string
  session_state?: string
  created_at: string
  updated_at: string
}

export interface Session {
  id: string
  user_id: string
  session_token: string
  expires: string
  created_at: string
  updated_at: string
}

export interface Integration {
  id: string
  user_id: string
  provider: string
  provider_user_id?: string
  access_token?: string
  refresh_token?: string
  expires_at?: string
  refresh_token_expires_at?: string
  scopes?: string[]
  metadata?: Record<string, any>
  status?: "connected" | "disconnected" | "expired" | "needs_reauthorization"
  created_at: string
  updated_at: string
  is_active?: boolean
  last_token_refresh?: string
  consecutive_failures?: number
  disconnected_at?: string
  disconnect_reason?: string
}

export interface EmailFrequencyCache {
  id: string
  user_id: string
  email: string
  name?: string
  frequency: number
  last_used: string
  source: string
  integration_id?: string
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface WorkflowExecution {
  id: string
  workflow_id: string
  user_id: string
  status: "pending" | "running" | "success" | "error" | "cancelled"
  input_data?: Record<string, any>
  output_data?: Record<string, any>
  error_message?: string
  started_at: string
  completed_at?: string
  execution_time_ms?: number
  retry_count: number
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface ScheduledWorkflowExecution {
  id: string
  workflow_execution_id: string
  workflow_id: string
  user_id: string
  scheduled_for: string
  schedule_type: "wait" | "cron" | "webhook" | "manual"
  status: "scheduled" | "processing" | "completed" | "failed" | "cancelled"
  current_node_id: string
  next_node_id?: string
  execution_context: Record<string, any>
  input_data: Record<string, any>
  wait_config: Record<string, any>
  retry_count: number
  max_retries: number
  error_message?: string
  created_at: string
  updated_at: string
  processed_at?: string
  completed_at?: string
}

export interface SupportTicket {
  id: string
  user_id: string
  ticket_number: string
  subject: string
  description: string
  priority: "low" | "medium" | "high" | "urgent"
  status: "open" | "in_progress" | "waiting_for_user" | "resolved" | "closed"
  category: "bug" | "feature_request" | "integration_issue" | "billing" | "general" | "technical_support"
  assigned_to?: string
  user_email: string
  user_name?: string
  browser_info?: Record<string, any>
  system_info?: Record<string, any>
  error_details?: Record<string, any>
  attachments?: Record<string, any>
  tags?: string[]
  internal_notes?: string
  resolution?: string
  resolved_at?: string
  closed_at?: string
  created_at: string
  updated_at: string
}

export interface SupportTicketResponse {
  id: string
  ticket_id: string
  user_id?: string
  is_staff_response: boolean
  message: string
  attachments?: Record<string, any>
  internal_notes?: string
  created_at: string
  updated_at: string
}
