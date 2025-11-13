import { getDecryptedAccessToken, resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'

/**
 * Retrieves a single Airtable record by ID
 */
export async function getAirtableRecord(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(userId, 'airtable')

    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const recordId = resolveValue(config.recordId, input)

    if (!baseId || !tableName || !recordId) {
      const missingFields = []
      if (!baseId) missingFields.push('Base ID')
      if (!tableName) missingFields.push('Table Name')
      if (!recordId) missingFields.push('Record ID')

      const message = `Missing required fields for fetching record: ${missingFields.join(', ')}`
      logger.error(message)
      return { success: false, error: message }
    }

    const response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Failed to fetch record: ${response.status} - ${errorData.error?.message || response.statusText}`
      )
    }

    const record = await response.json()

    return {
      success: true,
      output: {
        recordId: record.id,
        fields: record.fields,
        createdTime: record.createdTime,
        baseId,
        tableName,
      },
      message: `Fetched record ${record.id} from ${tableName}`,
    }
  } catch (error: any) {
    logger.error('Airtable get record error:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred while fetching the record',
    }
  }
}
