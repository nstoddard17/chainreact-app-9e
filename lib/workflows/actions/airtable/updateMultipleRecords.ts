import { resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'
import { updateAirtableRecord } from './updateRecord'

export async function updateMultipleAirtableRecords(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const tableId = resolveValue(config.tableId, input)
    const rawRecordIds = resolveValue(config.recordIds, input) ?? config.recordIds
    const recordIds = parseRecordIds(rawRecordIds)

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push('Base ID')
      if (!tableName) missingFields.push('Table Name')
      const message = `Missing required fields for updating records: ${missingFields.join(', ')}`
      logger.error(message)
      return { success: false, error: message }
    }

    if (recordIds.length === 0) {
      return {
        success: false,
        error: 'Select at least one record to update',
      }
    }

    const limit = Math.min(recordIds.length, 10)
    const sharedConfig = { ...config }
    delete sharedConfig.recordIds

    // Extract preserveExistingAttachments setting for attachment handling
    const preserveExistingAttachments = resolveValue(config.preserveExistingAttachments, input)

    const updatedRecords: any[] = []
    const failedRecords: Array<{ recordId: string; error: string }> = []

    for (const recordId of recordIds.slice(0, limit)) {
      const recordConfig: Record<string, any> = {
        ...sharedConfig,
        baseId,
        tableName,
        recordId,
      }

      if (tableId) {
        recordConfig.tableId = tableId
      }

      // Pass through preserveExistingAttachments setting for each record
      if (preserveExistingAttachments !== undefined) {
        recordConfig.preserveExistingAttachments = preserveExistingAttachments
      }

      try {
        const result = await updateAirtableRecord(recordConfig, userId, input)
        if (!result.success) {
          throw new Error(result.error || result.message || 'Airtable update record failed')
        }
        updatedRecords.push({
          ...(result.output || {}),
          recordId,
        })
      } catch (error: any) {
        const message = error?.message || 'Unknown error'
        failedRecords.push({ recordId, error: message })
        logger.error(`Airtable update record ${recordId} failed:`, message)
      }
    }

    const success = failedRecords.length === 0
    const message = success
      ? `Updated ${updatedRecords.length} record${updatedRecords.length === 1 ? '' : 's'}`
      : `Updated ${updatedRecords.length} record(s) with ${failedRecords.length} failure(s)`

    return {
      success,
      message,
      error: success ? undefined : 'Some records failed to update',
      output: {
        updatedRecords,
        updateCount: updatedRecords.length,
        failedRecords,
        baseId,
        tableName,
        attemptedRecordIds: recordIds.slice(0, limit),
      },
    }
  } catch (error: any) {
    logger.error('Airtable update multiple records error:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred while updating records',
    }
  }
}

function parseRecordIds(recordIds: any): string[] {
  if (!recordIds) return []
  if (Array.isArray(recordIds)) {
    return recordIds
      .map(id => (typeof id === 'string' ? id.trim() : id))
      .filter(Boolean)
  }

  if (typeof recordIds === 'string') {
    return recordIds
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
  }

  return []
}
