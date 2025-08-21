/**
 * Google Data Handlers Registry
 */

import { GoogleDataHandler } from '../types'
import { getGoogleCalendars } from './calendars'
import { getGoogleSheetsSpreadsheets, getGoogleSheetsSheets, getGoogleSheetsSheetPreview, getGoogleSheetsSheetData } from './sheets'
import { getGoogleDriveFolders, getGoogleDriveFiles } from './drive'

export const googleHandlers: Record<string, GoogleDataHandler> = {
  'google-calendars': getGoogleCalendars,
  'google-sheets_spreadsheets': getGoogleSheetsSpreadsheets,
  'google-sheets_sheets': getGoogleSheetsSheets,
  'google-sheets_sheet-preview': getGoogleSheetsSheetPreview,
  'google-sheets_sheet-data': getGoogleSheetsSheetData,
  'google-drive-folders': getGoogleDriveFolders,
  'google-drive-files': getGoogleDriveFiles,
}

export {
  getGoogleCalendars,
  getGoogleSheetsSpreadsheets,
  getGoogleSheetsSheets,
  getGoogleSheetsSheetPreview,
  getGoogleSheetsSheetData,
  getGoogleDriveFolders,
  getGoogleDriveFiles,
}