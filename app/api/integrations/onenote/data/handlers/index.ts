/**
 * OneNote Data Handlers Export
 */

import { getOneNoteNotebooks } from './notebooks'
import { getOneNoteSections } from './sections'
import { getOneNotePages } from './pages'

export const oneNoteHandlers = {
  'onenote_notebooks': getOneNoteNotebooks,
  'onenote_sections': getOneNoteSections,
  'onenote_pages': getOneNotePages
}

export {
  getOneNoteNotebooks,
  getOneNoteSections,
  getOneNotePages
}