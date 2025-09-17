/**
 * Dropbox Data Handlers Export
 */

import { getDropboxFolders } from './folders'

export const dropboxHandlers = {
  'dropbox-folders': getDropboxFolders,
  'folders': getDropboxFolders  // Also support 'folders' for consistency
}

export {
  getDropboxFolders
}