/**
 * Airtable Data Handlers Export
 */

import { getAirtableBases } from './bases'
import { getAirtableTables } from './tables'
import { getAirtableRecords } from './records'
import { getAirtableSingleRecord } from './singleRecord'
import { getAirtableFeedbackRecords } from './feedbackRecords'
import { getAirtableTaskRecords } from './taskRecords'
import { getAirtableProjectRecords } from './projectRecords'
import { getAirtableFields } from './fields'
import { getAirtableFieldValues } from './fieldValues'
import { getAirtableBatchFieldValues } from './batchFieldValues'
import { getAirtableDraftNames } from './draftNames'
import { getAirtableDesigners } from './designers'
import { getAirtableProjects } from './projects'
import { getAirtableFeedback } from './feedback'
import { getAirtableTasks } from './tasks'
import { getLinkedTableRecords } from './linkedRecords'
import { getAirtableAttachmentFields } from './attachmentFields'
import { AirtableIntegration, AirtableHandlerOptions } from '../types'
import { AirtableFieldOption } from './fields'

// Wrapper handler for editable fields only (filters out read-only fields)
const getAirtableEditableFields = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableFieldOption[]> => {
  return getAirtableFields(integration, { ...options, filterReadOnly: true })
}

export const airtableHandlers = {
  'airtable_bases': getAirtableBases,
  'airtable_tables': getAirtableTables,
  'airtable_records': getAirtableRecords,
  'airtable_single_record': getAirtableSingleRecord,
  'airtable_feedback_records': getAirtableFeedbackRecords,
  'airtable_task_records': getAirtableTaskRecords,
  'airtable_project_records': getAirtableProjectRecords,
  'airtable_fields': getAirtableFields,
  'airtable_editable_fields': getAirtableEditableFields,  // Only shows fields that can be edited (no formula, count, etc.)
  'airtable_field_values': getAirtableFieldValues,
  'airtable_attachment_fields': getAirtableAttachmentFields,
  'airtable_batch_field_values': getAirtableBatchFieldValues,
  'airtable_draft_names': getAirtableDraftNames,
  'airtable_designers': getAirtableDesigners,
  'airtable_projects': getAirtableProjects,
  'airtable_feedback': getAirtableFeedback,
  'airtable_tasks': getAirtableTasks,
  'airtable_linked_records': getLinkedTableRecords
}

export {
  getAirtableBases,
  getAirtableTables,
  getAirtableRecords,
  getAirtableSingleRecord,
  getAirtableFeedbackRecords,
  getAirtableTaskRecords,
  getAirtableProjectRecords,
  getAirtableFields,
  getAirtableFieldValues,
  getAirtableAttachmentFields,
  getAirtableBatchFieldValues,
  getAirtableDraftNames,
  getAirtableDesigners,
  getAirtableProjects,
  getAirtableFeedback,
  getAirtableTasks,
  getLinkedTableRecords
}
