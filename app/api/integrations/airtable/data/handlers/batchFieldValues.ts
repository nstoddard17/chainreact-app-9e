/**
 * Airtable Batch Field Values Handler
 * Fetches values for multiple fields at once to reduce API calls
 */

import { AirtableIntegration, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'
import { logger } from '@/lib/utils/logger'

export interface BatchFieldValue {
  fieldName: string
  values: Array<{
    value: string
    label: string
    count?: number
  }>
}

export interface BatchFieldValuesOptions extends AirtableHandlerOptions {
  fields: Array<{
    name: string
    type: string
  }>
}

export const getAirtableBatchFieldValues: AirtableDataHandler<BatchFieldValue> = async (integration: AirtableIntegration, options: BatchFieldValuesOptions): Promise<BatchFieldValue[]> => {
  const { baseId, tableName, fields } = options as BatchFieldValuesOptions

  logger.debug("🔍 Airtable batch field values fetcher called with:", {
    integrationId: integration.id,
    baseId,
    tableName,
    fieldCount: fields?.length || 0,
    fields: fields?.map(f => f.name),
    hasToken: !!integration.access_token
  })

  try {
    // Validate integration status
    validateAirtableIntegration(integration)

    logger.debug(`🔍 Validating Airtable token...`)
    const tokenResult = await validateAirtableToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ Airtable token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    if (!baseId || !tableName || !fields || fields.length === 0) {
      throw new Error('Base ID, table name, and fields array are required for batch field values')
    }

    logger.debug('🔍 Fetching Airtable records to extract batch field values...')

    // Build the URL for getting records from the table
    const url = new URL(buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}`))

    // Only fetch the fields we need for efficiency
    fields.forEach(field => {
      url.searchParams.append('fields[]', field.name)
    })
    url.searchParams.append('maxRecords', '1000') // Get enough records to capture all unique values

    const response = await makeAirtableApiRequest(url.toString(), tokenResult.token!)
    const recordsData = await parseAirtableApiResponse(response)

    logger.debug('🔍 [Batch Field Values] Records fetched:', {
      recordCount: recordsData.records?.length || 0,
      fieldsRequested: fields.map(f => f.name),
      sampleRecord: recordsData.records?.[0]?.fields
    });

    // Track value counts for each field
    const fieldValueCounts: Record<string, Record<string, number>> = {}
    fields.forEach(field => {
      fieldValueCounts[field.name] = {}
    })

    // Extract unique values from all specified fields
    recordsData.records?.forEach((record: any) => {
      fields.forEach(field => {
        const fieldValue = record.fields?.[field.name]

        if (fieldValue !== null && fieldValue !== undefined) {
          let values: string[] = []

          if (Array.isArray(fieldValue)) {
            // Handle multi-select, linked records, etc.
            values = fieldValue.map(v => {
              if (typeof v === 'object') {
                // For linked records, use id or name
                return v.id || v.name || v.value || String(v)
              }
              return String(v)
            })
          } else if (typeof fieldValue === 'object') {
            // Handle objects (like user references)
            values = [fieldValue.id || fieldValue.name || fieldValue.email || fieldValue.value || String(fieldValue)]
          } else {
            // Handle simple values
            values = [String(fieldValue)]
          }

          // Count occurrences
          values.forEach(value => {
            if (value && String(value).trim()) {
              const cleanValue = String(value).trim()
              fieldValueCounts[field.name][cleanValue] = (fieldValueCounts[field.name][cleanValue] || 0) + 1
            }
          })
        }
      })
    })

    // Convert to result format
    const results: BatchFieldValue[] = fields.map(field => {
      const valueCounts = fieldValueCounts[field.name]
      const fieldValues = Object.entries(valueCounts)
        .map(([value, count]) => ({
          value,
          label: value,
          count
        }))
        .sort((a, b) => (b.count || 0) - (a.count || 0))
        .slice(0, 100) // Limit to top 100 values per field for UI performance

      return {
        fieldName: field.name,
        values: fieldValues
      }
    })

    logger.debug(`✅ Airtable batch field values fetched successfully:`, {
      fieldCount: results.length,
      totalValues: results.reduce((sum, r) => sum + r.values.length, 0),
      breakdown: results.map(r => ({ field: r.fieldName, count: r.values.length }))
    })

    return results

  } catch (error: any) {
    logger.error("Error fetching Airtable batch field values:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Airtable batch field values")
  }
}
