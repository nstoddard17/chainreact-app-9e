/**
 * Dropbox Data Handlers Export
 */

import { getDropboxFolders } from './folders'

export const dropboxHandlers = {
  'dropbox-folders': getDropboxFolders
}

export {
  getDropboxFolders
}