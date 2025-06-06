export interface OAuthAccount {
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

export interface Integration {
  id: string
  user_id: string
  provider: string
  provider_account_id: string
  access_token?: string
  refresh_token?: string
  expires_at?: number
  token_type?: string
  scope?: string
  granted_scopes?: string[]
  missing_scopes?: string[]
  scope_validation_status?: "valid" | "invalid" | "partial"
  last_scope_check?: string
  metadata?: Record<string, any>
  is_active: boolean
  created_at: string
  updated_at: string
}

export const integrations = {
  tableName: "integrations",
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
    granted_scopes: "granted_scopes",
    missing_scopes: "missing_scopes",
    scope_validation_status: "scope_validation_status",
    last_scope_check: "last_scope_check",
    metadata: "metadata",
    is_active: "is_active",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

export interface Workflow {
  id: string
  user_id: string
  name: string
  description?: string
  nodes: any[]
  edges: any[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface WorkflowExecution {
  id: string
  workflow_id: string
  status: "pending" | "running" | "completed" | "failed"
  started_at: string
  completed_at?: string
  error_message?: string
  execution_data?: Record<string, any>
}

export interface Template {
  id: string
  name: string
  description: string
  category: string
  workflow_data: any
  is_public: boolean
  created_by: string
  created_at: string
  updated_at: string
}

// Schema definitions for required exports
export const users = {
  tableName: "users",
  columns: {
    id: "id",
    email: "email",
    name: "name",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

export const trelloIntegrationTable = {
  tableName: "trello_integrations",
  columns: {
    id: "id",
    user_id: "user_id",
    token: "token",
    token_secret: "token_secret",
    created_at: "created_at",
    updated_at: "updated_at",
  },
}

export const onedrive_auth_state = {
  tableName: "onedrive_auth_state",
  columns: {
    id: "id",
    user_id: "user_id",
    state: "state",
    code_verifier: "code_verifier",
    created_at: "created_at",
    expires_at: "expires_at",
  },
}
