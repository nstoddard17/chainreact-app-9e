/**
 * Notion Integration Types
 */

export interface NotionIntegration {
  id: string
  user_id: string
  provider: 'notion'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface NotionPage {
  id: string
  name?: string
  title?: string
  value: string
  label?: string
  url?: string
  created_time?: string
  last_edited_time?: string
  workspace?: string
  workspaceId?: string
  object?: string
  archived?: boolean
  parent?: {
    type: string
    database_id?: string
    page_id?: string
  }
  properties?: any
}

export interface NotionWorkspace {
  id: string
  name: string
  value: string
  label?: string
  type?: string
  object?: string
  owner?: any
  icon?: {
    type: string
    emoji?: string
    file?: any
  }
}

export interface NotionDatabase {
  id: string
  name: string
  value: string
  title?: string
  url?: string
  created_time?: string
  last_edited_time?: string
  properties?: Record<string, any>
  parent?: {
    type: string
    page_id?: string
    workspace?: boolean
  }
}

export interface NotionUser {
  id: string
  name: string
  value: string
  type?: string
  avatar_url?: string
  person?: {
    email?: string
  }
  bot?: {
    owner?: any
    workspace_name?: string
  }
}

export interface NotionTemplate {
  id: string
  name: string
  value: string
  description?: string
  type?: string
  properties?: any
}

export interface NotionDatabaseProperty {
  id: string
  name: string
  value: string
  label?: string
  type: string
  property?: any
  databaseId?: string
  databaseTitle?: string
  options?: any[]
  formula?: any
  relation?: any
  rollup?: any
}

export interface NotionApiError extends Error {
  status?: number
  code?: string
}

export interface NotionDataHandler<T = any> {
  (integration: NotionIntegration, options?: any): Promise<T[]>
}

export interface NotionHandlerOptions {
  [key: string]: any
}