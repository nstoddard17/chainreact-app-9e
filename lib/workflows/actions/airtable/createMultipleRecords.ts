import { resolveValue, ActionResult } from '@/lib/workflows/actions/core'
import { logger } from '@/lib/utils/logger'
import { createAirtableRecord } from './createRecord'

type FieldMapping = Record<string, string>

export async function createMultipleAirtableRecords(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const baseId = resolveValue(config.baseId, input)
    const tableName = resolveValue(config.tableName, input)
    const tableId = resolveValue(config.tableId, input)

    if (!baseId || !tableName) {
      const missingFields = []
      if (!baseId) missingFields.push('Base ID')
      if (!tableName) missingFields.push('Table Name')
      const message = `Missing required fields for creating records: ${missingFields.join(', ')}`
      logger.error(message)
      return { success: false, error: message }
    }

    const records = normalizeRecords(config, input)
    if (records.length === 0) {
      return {
        success: false,
        error: 'No record data provided. Add at least one record before running this action.',
      }
    }

    const limit = Math.min(Number(config.maxRecords) || 10, 10)
    const continueOnError = Boolean(config.continueOnError)

    const createdRecords: any[] = []
    const failedRecords: Array<{ index: number; error: string }> = []

    for (const [index, recordFields] of records.entries()) {
      if (index >= limit) break

      const recordConfig = buildRecordConfig(baseId, tableName, tableId, recordFields)

      try {
        const result = await createAirtableRecord(recordConfig, userId, input)
        if (!result.success) {
          throw new Error(result.error || result.message || 'Airtable create record failed')
        }
        createdRecords.push(result.output ?? {})
      } catch (error: any) {
        const message = error?.message || 'Unknown error'
        failedRecords.push({ index, error: message })
        logger.error(`Airtable create record ${index + 1} failed:`, message)
        if (!continueOnError) {
          return {
            success: false,
            error: `Failed to create record ${index + 1}: ${message}`,
            output: {
              createdRecords,
              failedRecords,
              createCount: createdRecords.length,
              recordIds: createdRecords
                .map(record => record?.recordId || record?.id)
                .filter(Boolean),
              baseId,
              tableName,
            },
          }
        }
      }
    }

    const success = failedRecords.length === 0
    const message = success
      ? `Created ${createdRecords.length} record${createdRecords.length === 1 ? '' : 's'}`
      : `Created ${createdRecords.length} record(s) with ${failedRecords.length} failure(s)`

    return {
      success,
      message,
      error: success ? undefined : 'Some records failed to create',
      output: {
        createdRecords,
        createCount: createdRecords.length,
        recordIds: createdRecords
          .map(record => record?.recordId || record?.id)
          .filter(Boolean),
        failedRecords,
        baseId,
        tableName,
      },
    }
  } catch (error: any) {
    logger.error('Airtable create multiple records error:', error)
    return {
      success: false,
      error: error.message || 'An unexpected error occurred while creating multiple records',
    }
  }
}

function normalizeRecords(config: any, input: Record<string, any>): Record<string, any>[] {
  const mode = (config?.inputMode || 'individual').toLowerCase()

  if (mode === 'json') {
    const raw = resolveValue(config.records ?? config.recordsData, input)
    return coerceRecordArray(raw)
  }

  if (mode === 'from_previous_step') {
    const raw = resolveValue(config.sourceArray, input)
    const sourceRecords = coerceRecordArray(raw)
    const mapping = parseFieldMapping(config.fieldMapping)
    if (!mapping) {
      return sourceRecords
    }
    return sourceRecords
      .map(record => mapRecordWithFieldMapping(record, mapping))
      .filter(record => Object.keys(record).length > 0)
  }

  // Default to individual mode using recordsData
  return coerceRecordArray(config.recordsData ?? config.records ?? [])
}

function coerceRecordArray(value: any): Record<string, any>[] {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed)
      return coerceRecordArray(parsed)
    } catch {
      return []
    }
  }

  if (Array.isArray(value)) {
    return value
      .filter(record => record && typeof record === 'object')
      .map(record => ({ ...record }))
  }

  if (value && typeof value === 'object') {
    return [{ ...value }]
  }

  return []
}

function parseFieldMapping(mapping: any): FieldMapping | null {
  if (!mapping) return null

  let parsed = mapping
  if (typeof mapping === 'string') {
    try {
      parsed = JSON.parse(mapping)
    } catch {
      return null
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  const normalized: FieldMapping = {}
  Object.entries(parsed).forEach(([sourceField, targetField]) => {
    if (typeof targetField === 'string' && targetField.trim().length > 0) {
      normalized[sourceField] = targetField
    }
  })

  return Object.keys(normalized).length > 0 ? normalized : null
}

function mapRecordWithFieldMapping(record: any, mapping: FieldMapping): Record<string, any> {
  if (!record || typeof record !== 'object') {
    return {}
  }

  const result: Record<string, any> = {}
  Object.entries(mapping).forEach(([sourceField, targetField]) => {
    const value = getNestedValue(record, sourceField)
    if (value !== undefined) {
      result[targetField] = value
    }
  })

  return result
}

function getNestedValue(record: any, path: string) {
  return path.split('.').reduce((acc: any, key: string) => {
    if (acc === null || acc === undefined) return undefined
    return acc[key]
  }, record)
}

function buildRecordConfig(
  baseId: string,
  tableName: string,
  tableId: string | undefined,
  fields: Record<string, any>
) {
  const recordConfig: Record<string, any> = {
    baseId,
    tableName,
  }

  if (tableId) {
    recordConfig.tableId = tableId
  }

  Object.entries(fields || {}).forEach(([fieldName, value]) => {
    if (value === undefined || value === null) {
      return
    }

    const key = fieldName.startsWith('airtable_field_')
      ? fieldName
      : `airtable_field_${fieldName}`
    recordConfig[key] = value
  })

  return recordConfig
}
