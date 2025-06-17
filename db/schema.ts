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
    provider_user_id: "provider_user_id",
    access_token: "access_token",
    refresh_token: "refresh_token",
    expires_at: "expires_at",
    scopes: "scopes",
    metadata: "metadata",
    status: "status",
    created_at: "created_at",
    updated_at: "updated_at",
    last_refreshed_at: "last_refreshed_at",
    last_used_at: "last_used_at",
    is_active: "is_active",
    last_token_refresh_status: "last_token_refresh_status",
    consecutive_failures: "consecutive_failures",
    last_failure_at: "last_failure_at",
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
  scopes?: string[]
  metadata?: Record<string, any>
  status?: "connected" | "disconnected" | "error" | "syncing"
  created_at: string
  updated_at: string
  last_refreshed_at?: string
  last_used_at?: string
  is_active?: boolean
  last_token_refresh_status?: "success" | "failure"
  consecutive_failures?: number
  last_failure_at?: string
}
