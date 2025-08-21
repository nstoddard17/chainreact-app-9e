/**
 * Dropbox Integration Types
 */

export interface DropboxIntegration {
  id: string
  user_id: string
  provider: 'dropbox'
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface DropboxFolder {
  id: string
  name: string
  value: string
  path: string
  created_time?: string | null
  modified_time?: string | null
  ".tag"?: string
  path_lower?: string
  path_display?: string
}

export interface DropboxFile {
  id: string
  name: string
  path: string
  size: number
  created_time?: string
  modified_time?: string
  ".tag"?: string
  path_lower?: string
  path_display?: string
  client_modified?: string
  server_modified?: string
  rev?: string
  content_hash?: string
}

export interface DropboxEntry {
  ".tag": "file" | "folder"
  name: string
  path_lower: string
  path_display: string
  id?: string
  size?: number
  server_modified?: string
  client_modified?: string
  rev?: string
  content_hash?: string
}

export interface DropboxApiError extends Error {
  status?: number
  code?: string
  error_summary?: string
}

export interface DropboxDataHandler<T = any> {
  (integration: DropboxIntegration, options?: any): Promise<T[]>
}

export interface DropboxHandlerOptions {
  path?: string
  recursive?: boolean
  limit?: number
  [key: string]: any
}