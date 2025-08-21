/**
 * Airtable Data Handlers Export
 */

import { getAirtableBases } from './bases'
import { getAirtableTables } from './tables'
import { getAirtableRecords } from './records'
import { getAirtableFeedbackRecords } from './feedbackRecords'
import { getAirtableTaskRecords } from './taskRecords'
import { getAirtableProjectRecords } from './projectRecords'

export const airtableHandlers = {
  'airtable_bases': getAirtableBases,
  'airtable_tables': getAirtableTables,
  'airtable_records': getAirtableRecords,
  'airtable_feedback_records': getAirtableFeedbackRecords,
  'airtable_task_records': getAirtableTaskRecords,
  'airtable_project_records': getAirtableProjectRecords
}

export {
  getAirtableBases,
  getAirtableTables,
  getAirtableRecords,
  getAirtableFeedbackRecords,
  getAirtableTaskRecords,
  getAirtableProjectRecords
}