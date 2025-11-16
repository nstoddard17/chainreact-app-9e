import { getAirtableFields, type AirtableFieldOption } from './fields'
import type { AirtableDataHandler } from '../types'
import { logger } from '@/lib/utils/logger'

const ATTACHMENT_FIELD_TYPES = new Set(['multipleAttachments', 'singleAttachment'])

export const getAirtableAttachmentFields: AirtableDataHandler<AirtableFieldOption> = async (
  integration,
  options = {}
) => {
  const fields = await getAirtableFields(integration, options)

  logger.debug('[getAirtableAttachmentFields] All fields:', {
    totalFields: fields.length,
    fieldTypes: fields.map(f => ({ name: f.label, type: f.type }))
  })

  const attachmentFields = fields.filter(field => ATTACHMENT_FIELD_TYPES.has(field.type))

  logger.debug('[getAirtableAttachmentFields] Filtered attachment fields:', {
    attachmentFieldsFound: attachmentFields.length,
    attachmentFields: attachmentFields.map(f => ({ name: f.label, type: f.type }))
  })

  return attachmentFields
}
