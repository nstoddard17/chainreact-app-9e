/**
 * Dropbox Data Handlers Export
 */

import { getDropboxFolders } from './folders'
import { handleFiles } from './files'

export const dropboxHandlers = {
  'dropbox-folders': getDropboxFolders,
  'folders': getDropboxFolders, // Also support 'folders' for consistency
  'dropbox-files': handleFiles
}

export {
  getDropboxFolders,
  handleFiles
}