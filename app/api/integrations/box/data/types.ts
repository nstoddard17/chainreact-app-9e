/**
 * Box Integration Types
 */

export interface BoxIntegration {
  id: string
  user_id: string
  provider: 'box'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface BoxFolder {
  id: string
  name: string
  value: string
  created_time?: string | null
  modified_time?: string | null
  type: string
  etag?: string
  sequence_id?: string
  path_collection?: {
    total_count: number
    entries: Array<{
      id: string
      name: string
      type: string
    }>
  }
  created_by?: {
    id: string
    name: string
    login: string
  }
  modified_by?: {
    id: string
    name: string
    login: string
  }
  owned_by?: {
    id: string
    name: string
    login: string
  }
  shared_link?: any
  parent?: {
    id: string
    name: string
    type: string
  }
  item_status?: string
}

export interface BoxFile {
  id: string
  name: string
  type: string
  size: number
  created_time?: string
  modified_time?: string
  etag?: string
  sequence_id?: string
  sha1?: string
  file_version?: {
    id: string
    type: string
    sha1: string
  }
  created_by?: {
    id: string
    name: string
    login: string
  }
  modified_by?: {
    id: string
    name: string
    login: string
  }
  owned_by?: {
    id: string
    name: string
    login: string
  }
  shared_link?: any
  parent?: {
    id: string
    name: string
    type: string
  }
  item_status?: string
}

export interface BoxEntry {
  id: string
  name: string
  type: "file" | "folder"
  created_at?: string
  modified_at?: string
  etag?: string
  sequence_id?: string
  size?: number
}

export interface BoxApiError extends Error {
  status?: number
  code?: string
  context_info?: any
}

export interface BoxDataHandler<T = any> {
  (integration: BoxIntegration, options?: any): Promise<T[]>
}

export interface BoxHandlerOptions {
  folderId?: string
  limit?: number
  offset?: number
  fields?: string
  [key: string]: any
}