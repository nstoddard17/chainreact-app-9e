/**
 * Type definitions for Microsoft Excel integration
 */

export interface MicrosoftExcelIntegration {
  id: string
  user_id: string
  provider: string
  access_token: string
  refresh_token?: string
  expires_at?: string
  status: 'connected' | 'disconnected' | 'error'
  metadata?: any
}

export interface ExcelWorkbook {
  id: string
  name: string
  webUrl?: string
  createdDateTime?: string
  lastModifiedDateTime?: string
}

export interface ExcelWorksheet {
  id: string
  name: string
  position?: number
  visibility?: string
}

export interface ExcelColumn {
  name: string
  index: number
  values?: any[]
}

export interface ExcelHandlerOptions {
  workbookId?: string
  worksheetName?: string
  columnName?: string
  range?: string
  limit?: number
  forceRefresh?: boolean
}

export type ExcelDataHandler = (
  integration: MicrosoftExcelIntegration,
  options: ExcelHandlerOptions
) => Promise<any>

export interface ExcelHandlers {
  [key: string]: ExcelDataHandler
}