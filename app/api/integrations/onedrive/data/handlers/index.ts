/**
 * OneDrive Data Handlers Export
 */

import { getOneDriveFolders } from './folders'
import { getOneDriveFiles } from './files'

export const onedriveHandlers: Record<string, OneDriveDataHandler<any>> = {
  'onedrive-folders': getOneDriveFolders,
  'onedrive-files': getOneDriveFiles,
}

export {
  getOneDriveFolders,
  getOneDriveFiles,
}