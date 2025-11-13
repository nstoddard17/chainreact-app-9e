import { getAirtableFields, type AirtableFieldOption } from './fields'
import type { AirtableDataHandler } from '../types'

const ATTACHMENT_FIELD_TYPES = new Set(['multipleAttachments', 'singleAttachment'])

export const getAirtableAttachmentFields: AirtableDataHandler<AirtableFieldOption> = async (
  integration,
  options = {}
) => {
  const fields = await getAirtableFields(integration, options)

  return fields.filter(field => ATTACHMENT_FIELD_TYPES.has(field.type))
}
