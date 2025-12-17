/**
 * OneDrive Data Handlers Export
 */

import { getOneDriveFolders } from './folders'
import { getOneDriveFiles } from './files'
import type { OneDriveDataHandler } from '../types'

export const onedriveHandlers: Record<string, OneDriveDataHandler<any>> = {
  'onedrive-folders': getOneDriveFolders,
  'onedrive-files': getOneDriveFiles,
}

export {
  getOneDriveFolders,
  getOneDriveFiles,
}