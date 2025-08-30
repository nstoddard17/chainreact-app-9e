/**
 * Google Sheets Integration Types
 */

export interface GoogleSheetsIntegration {
  id: string
  user_id: string
  provider: 'google'
  status: 'connected' | 'disconnected' | 'error'
  access_token: string | null
  refresh_token: string | null
  metadata?: any
  expires_at?: string | null
  created_at: string
  updated_at: string
}

export interface GoogleSheetsRow {
  rowNumber: number
  values: any[]
  formattedValues?: any[]
}

export interface GoogleSheetsRecord {
  id: string
  rowNumber: number
  fields: Record<string, any>
  label?: string
}

export interface GoogleSheetsHandlerOptions {
  spreadsheetId?: string
  sheetName?: string
  range?: string
  maxRows?: number
  startRow?: number
  endRow?: number
  filterField?: string
  filterValue?: any
  searchQuery?: string
  includeHeaders?: boolean
}

export type GoogleSheetsDataHandler<T = any> = (
  integration: GoogleSheetsIntegration,
  options?: GoogleSheetsHandlerOptions
) => Promise<T>

export interface GoogleSheetsSpreadsheet {
  id: string
  name: string
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
}

export interface GoogleSheetsSheet {
  id: number
  name: string
  index: number
  rowCount: number
  columnCount: number
}