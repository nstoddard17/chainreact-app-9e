/**
 * Google Integration Types
 */

export interface GoogleIntegration {
  id: string
  user_id: string
  provider: string // 'google', 'google-calendar', 'google-drive', etc.
  access_token: string
  refresh_token?: string
  status: string
  expires_at?: string | null
  scopes?: string[]
  metadata?: any
}

export interface GoogleCalendar {
  id: string
  name: string
  value: string
  description?: string
  primary?: boolean
  access_role?: string
  background_color?: string
  foreground_color?: string
  selected?: boolean
  summary?: string
  time_zone?: string
}

export interface GoogleSpreadsheet {
  id: string
  name: string
  value: string
  url?: string
  created_time?: string
  modified_time?: string
  owners?: any[]
  shared?: boolean
  mime_type?: string
}

export interface GoogleSheet {
  id: number
  name: string
  value: string
  sheet_id?: number
  sheet_type?: string
  grid_properties?: {
    row_count?: number
    column_count?: number
  }
}

export interface GoogleSheetPreview {
  headers: Array<{
    column: string
    name: string
    index: number
  }>
  sampleData: any[][]
  totalRows: number
  hasHeaders: boolean
}

export interface GoogleSheetData {
  headers: Array<{
    column: string
    name: string
    index: number
  }>
  data: Array<{
    rowIndex: number
    values: any[]
    preview: string
  }>
  totalRows: number
}

export interface GoogleDriveFolder {
  id: string
  name: string
  value: string
  parent_ids?: string[]
  created_time?: string
  modified_time?: string
  owners?: any[]
  shared?: boolean
  web_view_link?: string
}

export interface GoogleDriveFile {
  id: string
  name: string
  value: string
  parent_ids?: string[]
  created_time?: string
  modified_time?: string
  mime_type?: string
  size?: string
  owners?: any[]
  shared?: boolean
  web_view_link?: string
  thumbnail_link?: string
}

export interface GoogleDocument {
  id: string
  name: string
  value: string
  created_time?: string
  modified_time?: string
  owners?: any[]
  shared?: boolean
  web_view_link?: string
  mime_type?: string
}

export interface GoogleApiError extends Error {
  status?: number
  code?: string
}

export interface GoogleDataHandler<T = any> {
  (integration: GoogleIntegration, options?: any): Promise<T[]>
}

export interface GoogleHandlerOptions {
  [key: string]: any
}