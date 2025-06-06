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
