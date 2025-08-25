/**
 * Google Data Handlers Registry
 */

import { GoogleDataHandler } from '../types'
import { getGoogleCalendars } from './calendars'
import { getGoogleSheetsSpreadsheets, getGoogleSheetsSheets, getGoogleSheetsSheetPreview, getGoogleSheetsSheetData, getGoogleSheetsColumns, getGoogleSheetsEnhancedPreview } from './sheets'
import { getGoogleDriveFolders, getGoogleDriveFiles } from './drive'
import { getGoogleContacts } from './contacts'

export const googleHandlers: Record<string, GoogleDataHandler> = {
  'google-calendars': getGoogleCalendars,
  'google-contacts': getGoogleContacts,
  'google-sheets_spreadsheets': getGoogleSheetsSpreadsheets,
  'google-sheets_sheets': getGoogleSheetsSheets,
  'google-sheets_sheet-preview': getGoogleSheetsSheetPreview,
  'google-sheets_sheet-data': getGoogleSheetsSheetData,
  'google-sheets_columns': getGoogleSheetsColumns,
  'google-sheets_enhanced-preview': getGoogleSheetsEnhancedPreview,
  'google-drive-folders': getGoogleDriveFolders,
  'google-drive-files': getGoogleDriveFiles,
}

export {
  getGoogleCalendars,
  getGoogleContacts,
  getGoogleSheetsSpreadsheets,
  getGoogleSheetsSheets,
  getGoogleSheetsSheetPreview,
  getGoogleSheetsSheetData,
  getGoogleSheetsColumns,
  getGoogleSheetsEnhancedPreview,
  getGoogleDriveFolders,
  getGoogleDriveFiles,
}