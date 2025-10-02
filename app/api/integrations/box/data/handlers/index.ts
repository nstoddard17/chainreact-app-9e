/**
 * Box Data Handlers Export
 */

import { getBoxFolders } from './folders'
import { handleFiles } from './files'

export const boxHandlers = {
  'box-folders': getBoxFolders,
  'box-files': handleFiles
}

export {
  getBoxFolders,
  handleFiles
}