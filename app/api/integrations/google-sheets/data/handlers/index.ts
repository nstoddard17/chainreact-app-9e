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
}