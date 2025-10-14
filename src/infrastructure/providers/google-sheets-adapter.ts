import { 
  DatabaseProvider, 
  DatabaseRecord, 
  DatabaseResult, 
  RecordFilters, 
  TableFilters, 
  Table, 
  SearchParams 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'
import { google, sheets_v4 } from 'googleapis'

import { logger } from '@/lib/utils/logger'

export class GoogleSheetsAdapter implements DatabaseProvider {
  readonly providerId = 'google-sheets'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: false,
    rateLimits: [
      { type: 'requests', limit: 1000, window: 100000 }, // 1000 requests per 100 seconds
      { type: 'reads', limit: 300, window: 60000 }, // 300 read requests per minute
      { type: 'writes', limit: 300, window: 60000 } // 300 write requests per minute
    ],
    supportedFeatures: [
      'create_record',
      'update_record',
      'delete_record',
      'get_records',
      'get_tables',
      'search_records',
      'create_spreadsheet',
      'format_cells',
      'batch_operations'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-sheets')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client })
      
      // Try to create a test spreadsheet to validate permissions
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: 'Test Connection'
          }
        }
      })
      
      // Clean up test spreadsheet
      if (response.data.spreadsheetId) {
        const drive = google.drive({ version: 'v3', auth: oauth2Client })
        await drive.files.delete({ fileId: response.data.spreadsheetId })
      }
      
      return true
    } catch {
      return false
    }
  }

  async createRecord(params: DatabaseRecord, userId: string): Promise<DatabaseResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-sheets')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client })
      
      if (!params.baseId) {
        throw new Error('Spreadsheet ID (baseId) is required')
      }
      
      const sheetName = params.tableName || 'Sheet1'
      
      // Convert fields object to array of values
      const values = Object.values(params.fields)
      
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: params.baseId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [values]
        }
      })
      
      return {
        success: true,
        output: {
          recordId: response.data.tableRange || '',
          fields: params.fields,
          range: response.data.tableRange,
          updatedRows: response.data.updates?.updatedRows || 1,
          googleResponse: response.data
        },
        message: 'Record created successfully in Google Sheets'
      }
    } catch (error: any) {
      logger.error('Google Sheets create record error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create record in Google Sheets',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async updateRecord(params: DatabaseRecord, userId: string): Promise<DatabaseResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-sheets')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client })
      
      if (!params.baseId || !params.id) {
        throw new Error('Spreadsheet ID (baseId) and row range (id) are required for update')
      }
      
      const sheetName = params.tableName || 'Sheet1'
      const range = params.id.includes(':') ? params.id : `${sheetName}!${params.id}`
      
      // Convert fields object to array of values
      const values = Object.values(params.fields)
      
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId: params.baseId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [values]
        }
      })
      
      return {
        success: true,
        output: {
          recordId: range,
          fields: params.fields,
          updatedCells: response.data.updatedCells || 0,
          updatedRows: response.data.updatedRows || 0,
          googleResponse: response.data
        },
        message: 'Record updated successfully in Google Sheets'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update record in Google Sheets',
        output: { error: error.message }
      }
    }
  }

  async deleteRecord(params: DatabaseRecord, userId: string): Promise<DatabaseResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-sheets')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client })
      
      if (!params.baseId || !params.id) {
        throw new Error('Spreadsheet ID (baseId) and row number (id) are required for delete')
      }
      
      const sheetName = params.tableName || 'Sheet1'
      const rowNumber = parseInt(params.id)
      
      if (isNaN(rowNumber)) {
        throw new Error('Row ID must be a valid row number for delete operation')
      }
      
      // Get sheet ID first
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: params.baseId
      })
      
      const sheet = spreadsheet.data.sheets?.find(s => s.properties?.title === sheetName)
      if (!sheet?.properties?.sheetId) {
        throw new Error(`Sheet "${sheetName}" not found`)
      }
      
      // Delete the row
      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: params.baseId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: sheet.properties.sheetId,
                dimension: 'ROWS',
                startIndex: rowNumber - 1, // 0-indexed
                endIndex: rowNumber
              }
            }
          }]
        }
      })
      
      return {
        success: true,
        output: {
          recordId: params.id,
          deletedRow: rowNumber,
          googleResponse: response.data
        },
        message: `Row ${rowNumber} deleted successfully from Google Sheets`
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to delete record from Google Sheets',
        output: { error: error.message }
      }
    }
  }

  async getRecords(filters?: RecordFilters, userId?: string): Promise<DatabaseRecord[]> {
    if (!userId) {
      throw new Error('User ID is required for getRecords')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-sheets')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client })
      
      if (!filters?.baseId) {
        throw new Error('Spreadsheet ID (baseId) is required')
      }
      
      const sheetName = filters.tableName || 'Sheet1'
      const range = `${sheetName}!A:Z`
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: filters.baseId,
        range: range
      })
      
      const values = response.data.values || []
      
      if (values.length === 0) {
        return []
      }
      
      // First row as headers
      const headers = values[0] as string[]
      const dataRows = values.slice(1)
      
      // Convert to DatabaseRecord format
      const records: DatabaseRecord[] = dataRows.map((row: any[], index: number) => {
        const fields: Record<string, any> = {}
        headers.forEach((header, colIndex) => {
          fields[header] = row[colIndex] || ''
        })
        
        return {
          id: (index + 2).toString(), // Row number (1-indexed, +1 for header)
          baseId: filters.baseId,
          tableName: sheetName,
          fields: fields
        }
      })
      
      // Apply filters
      let filteredRecords = records
      
      if (filters.maxRecords) {
        filteredRecords = filteredRecords.slice(0, filters.maxRecords)
      }
      
      return filteredRecords
    } catch (error: any) {
      logger.error('Google Sheets get records error:', error)
      return []
    }
  }

  async getTables(filters?: TableFilters, userId?: string): Promise<Table[]> {
    if (!userId) {
      throw new Error('User ID is required for getTables')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'google-sheets')
      const oauth2Client = new google.auth.OAuth2()
      oauth2Client.setCredentials({ access_token: accessToken })
      
      const sheets = google.sheets({ version: 'v4', auth: oauth2Client })
      
      if (!filters?.baseId) {
        throw new Error('Spreadsheet ID (baseId) is required')
      }
      
      const response = await sheets.spreadsheets.get({
        spreadsheetId: filters.baseId
      })
      
      const spreadsheetSheets = response.data.sheets || []
      
      return spreadsheetSheets.map((sheet: sheets_v4.Schema$Sheet) => ({
        id: sheet.properties?.sheetId?.toString() || '',
        name: sheet.properties?.title || 'Untitled Sheet',
        description: `Google Sheet with ${sheet.properties?.gridProperties?.rowCount || 0} rows and ${sheet.properties?.gridProperties?.columnCount || 0} columns`,
        fields: [] // Google Sheets doesn't have fixed field definitions
      }))
    } catch (error: any) {
      logger.error('Google Sheets get tables error:', error)
      return []
    }
  }

  async searchRecords(params: SearchParams, userId: string): Promise<DatabaseRecord[]> {
    try {
      // For Google Sheets, we'll implement search by getting all records and filtering
      const records = await this.getRecords({
        baseId: params.baseId,
        tableName: params.tableName,
        maxRecords: params.limit || 100
      }, userId)
      
      if (!params.filter && !params.searchFormula) {
        return records
      }
      
      // Simple text search across all fields
      const searchTerm = params.filter?.toLowerCase() || ''
      
      return records.filter(record => {
        return Object.values(record.fields).some(value => 
          String(value).toLowerCase().includes(searchTerm)
        )
      })
    } catch (error: any) {
      logger.error('Google Sheets search records error:', error)
      return []
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid credentials')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient permissions')) {
      return 'authorization'
    }
    if (message.includes('quota exceeded') || message.includes('rate limit')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('spreadsheet not found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('malformed')) {
      return 'validation'
    }
    if (message.includes('range') || message.includes('sheet')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}