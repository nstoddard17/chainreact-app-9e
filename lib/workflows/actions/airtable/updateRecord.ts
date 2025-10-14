import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import {
  AirtableAttachment,
  ensureArray,
  extractAttachmentCandidates,
  resolveAttachmentEntry,
  resolveTableId,
  UploadContext
} from './createRecord'
import { deleteTempAttachments, scheduleTempAttachmentCleanup } from './supabaseAttachment'

import { logger } from '@/lib/utils/logger'

/**
 * Updates an existing record in an Airtable table
 */
export async function updateAirtableRecord(
  config: any, 
  userId: string, 
  input: Record<string, any>
): Promise<ActionResult> {
  const cleanupPaths: string[] = []
  let recordUpdated = false

  try {
    const accessToken = await getDecryptedAccessToken(userId, "airtable")

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const recordId = resolveValue(config.recordId, input)
    const status = resolveValue(config.status, input)
    const tableId = resolveValue(config.tableId, input)

    const fields: Record<string, any> = {}

    try {
      for (const [key, value] of Object.entries(config || {})) {
        if (key.startsWith('airtable_field_')) {
          const fieldName = key.replace('airtable_field_', '')
          if (value !== undefined && typeof value !== 'function') {
            fields[fieldName] = value
          }
        }
      }
    } catch (err) {
      logger.error('Error extracting update fields from config:', err)
    }

    const directFields = config.fields || {}
    if (Object.keys(directFields).length > 0) {
      Object.assign(fields, directFields)
    }

    if (!baseId || !tableName || !recordId) {
      const missingFields = []
      if (!baseId) missingFields.push("Base ID")
      if (!tableName) missingFields.push("Table Name")
      if (!recordId) missingFields.push("Record ID")

      const message = `Missing required fields for updating record: ${missingFields.join(", ")}`
      logger.error(message)
      return { success: false, message }
    }

    const resolvedTableId = await resolveTableId(baseId, tableName, tableId, accessToken)
    const uploadContext: UploadContext = {
      accessToken,
      baseId,
      tableId: resolvedTableId || tableId || tableName,
      tableName
    }

    const resolvedFields: Record<string, any> = {}
    const attachmentErrors: string[] = []
    const skippedFields: string[] = []

    for (const [fieldName, fieldValue] of Object.entries(fields)) {
      if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
        continue
      }

      const resolved = resolveValue(fieldValue, input)

      const normalizedFieldName = fieldName.replace(/_/g, ' ').toLowerCase()
      const isLikelyAttachment =
        normalizedFieldName.includes('image') ||
        normalizedFieldName.includes('photo') ||
        normalizedFieldName.includes('attachment') ||
        normalizedFieldName.includes('file') ||
        normalizedFieldName.includes('document') ||
        normalizedFieldName.includes('picture') ||
        normalizedFieldName.includes('media')

      const candidateEntries = extractAttachmentCandidates(resolved)

      if ((isLikelyAttachment || candidateEntries) && resolved) {
        const entries = candidateEntries ?? ensureArray(resolved)
        const attachments: AirtableAttachment[] = []
        let hadAttachmentIssue = false

        for (let index = 0; index < entries.length; index++) {
          const entry = entries[index]
          try {
            const attachment = await resolveAttachmentEntry(
              entry,
              fieldName,
              index,
              uploadContext,
              cleanupPaths
            )

            if (attachment) {
              attachments.push(attachment)
            }
          } catch (attachmentError) {
            hadAttachmentIssue = true
            attachmentErrors.push(fieldName)
            logger.error(`❌ [Airtable] Error processing attachment for field "${fieldName}":`, attachmentError)
          }
        }

        if (attachments.length > 0) {
          resolvedFields[fieldName] = attachments
          continue
        }

        if (hadAttachmentIssue) {
          skippedFields.push(fieldName)
          continue
        }
      }

      if (typeof resolved === 'string' && resolved.startsWith('data:') && resolved.includes('base64,')) {
        skippedFields.push(fieldName)
        continue
      }

      resolvedFields[fieldName] = resolved
    }

    if (status) {
      resolvedFields.Status = status
    }

    if (Object.keys(resolvedFields).length === 0) {
      logger.debug('📊 [Airtable] No fields to update for record', recordId)
    }

    if (attachmentErrors.length > 0) {
      logger.debug(`📊 [Airtable] Encountered attachment issues with: ${[...new Set(attachmentErrors)].join(', ')}`)
    }

    if (skippedFields.length > 0) {
      logger.debug(`📊 [Airtable] Skipped fields during update: ${skippedFields.join(', ')}`)
    }

    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: resolvedFields,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to update record: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }

    const result = await response.json()
    recordUpdated = true

    return {
      success: true,
      output: {
        recordId: result.id,
        fields: result.fields,
        updatedTime: new Date().toISOString(),
        tableName: tableName,
        baseId: baseId,
        status: status,
      },
      message: `Successfully updated record in ${tableName}`
    }

  } catch (error: any) {
    logger.error("Airtable update record error:", error)
    return {
      success: false,
      error: error.message || "An unexpected error occurred while updating the record"
    }
  } finally {
    if (cleanupPaths.length > 0) {
      if (recordUpdated) {
        scheduleTempAttachmentCleanup(cleanupPaths)
      } else {
        try {
          await deleteTempAttachments(cleanupPaths)
        } catch (cleanupError) {
          logger.error('❌ [Airtable] Failed to remove temporary attachments after update failure:', cleanupError)
        }
      }
    }
  }
}
