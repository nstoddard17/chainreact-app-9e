/**
 * Google Sheets Data Handlers
 */

import { getGoogleSheetsRecords } from './records'
import { getGoogleSheetsSpreadsheets } from './spreadsheets'
import { getGoogleSheetsSheets } from './sheets'
import { getGoogleSheetsColumns } from './columns'
import { GoogleSheetsDataHandler } from '../types'

export const googleSheetsHandlers: Record<string, GoogleSheetsDataHandler> = {
  'google_sheets_records': getGoogleSheetsRecords,
  'google_sheets_spreadsheets': getGoogleSheetsSpreadsheets,
  'google_sheets_sheets': getGoogleSheetsSheets,
  'google_sheets_columns': getGoogleSheetsColumns,
  // Also support hyphenated versions for consistency
  'google-sheets_records': getGoogleSheetsRecords,
  'google-sheets_spreadsheets': getGoogleSheetsSpreadsheets,
  'google-sheets_sheets': getGoogleSheetsSheets,
  'google-sheets_columns': getGoogleSheetsColumns,
  // Support the format used in the field mappings
  'google-sheets-spreadsheets': getGoogleSheetsSpreadsheets,
  'google-sheets-sheets': getGoogleSheetsSheets,
  'google-sheets-columns': getGoogleSheetsColumns,
}