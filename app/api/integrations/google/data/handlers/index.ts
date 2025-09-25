/**
 * Google Data Handlers Registry
 */

import { GoogleDataHandler } from '../types'
import { getGoogleCalendars, getGoogleCalendarEvents } from './calendars'
import { getGoogleSheetsSpreadsheets, getGoogleSheetsSheets, getGoogleSheetsSheetPreview, getGoogleSheetsSheetData, getGoogleSheetsColumns, getGoogleSheetsEnhancedPreview, getGoogleSheetsColumnValues } from './sheets'
import { getGoogleDriveFolders, getGoogleDriveFiles, getGoogleDocsDocuments, getGoogleDocsContent } from './drive'
import { getGoogleContacts } from './contacts'

export const googleHandlers: Record<string, GoogleDataHandler> = {
  'google-calendars': getGoogleCalendars,
  'google-calendar-events': getGoogleCalendarEvents,
  'google-contacts': getGoogleContacts,
  'google-sheets_spreadsheets': getGoogleSheetsSpreadsheets,
  'google-sheets_sheets': getGoogleSheetsSheets,
  'google-sheets_sheet-preview': getGoogleSheetsSheetPreview,
  'google-sheets_sheet-data': getGoogleSheetsSheetData,
  'google-sheets_columns': getGoogleSheetsColumns,
  'google-sheets_column_values': getGoogleSheetsColumnValues,
  'google-sheets_enhanced-preview': getGoogleSheetsEnhancedPreview,
  'google-drive-folders': getGoogleDriveFolders,
  'google-drive-files': getGoogleDriveFiles,
  'google-docs-documents': getGoogleDocsDocuments,
  'google-docs-content': getGoogleDocsContent,
}

export {
  getGoogleCalendars,
  getGoogleCalendarEvents,
  getGoogleContacts,
  getGoogleSheetsSpreadsheets,
  getGoogleSheetsSheets,
  getGoogleSheetsSheetPreview,
  getGoogleSheetsSheetData,
  getGoogleSheetsColumns,
  getGoogleSheetsColumnValues,
  getGoogleSheetsEnhancedPreview,
  getGoogleDriveFolders,
  getGoogleDriveFiles,
  getGoogleDocsDocuments,
  getGoogleDocsContent,
}