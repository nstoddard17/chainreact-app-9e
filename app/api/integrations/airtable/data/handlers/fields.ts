/**
 * Airtable Fields Handler
 * Returns field names from a specific table for filtering purposes
 */

import { AirtableIntegration, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export interface AirtableFieldOption {
  value: string
  label: string
  type: string
  id: string
}

// Read-only field types that cannot be edited via the API
const READ_ONLY_FIELD_TYPES = [
  'formula',           // Formula fields (computed)
  'rollup',            // Rollup fields (aggregated from linked records)
  'count',             // Count fields (counts linked records)
  'lookup',            // Lookup fields (pulls data from linked records)
  'createdTime',       // Created time (auto-generated)
  'lastModifiedTime',  // Last modified time (auto-generated)
  'createdBy',         // Created by (auto-generated)
  'lastModifiedBy',    // Last modified by (auto-generated)
  'autoNumber',        // Auto number (auto-generated)
  'barcode',           // Barcode (scanned, typically read-only)
  'button',            // Button fields (action fields, not data fields)
  'computed',          // Computed/calculated fields (read-only)
  'aiText'             // AI-generated text fields (read-only)
]

export const getAirtableFields: AirtableDataHandler<AirtableFieldOption> = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableFieldOption[]> => {
  const { baseId, tableName, filterReadOnly = false } = options

  logger.debug("🔍 Airtable fields fetcher called with:", {
    integrationId: integration.id,
    baseId,
    tableName,
    filterReadOnly,
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

    if (!baseId || !tableName) {
      throw new Error('Base ID and table name are required for fetching fields')
    }

    logger.debug('🔍 Fetching Airtable table schema from API...')
    const apiUrl = buildAirtableApiUrl(`/v0/meta/bases/${baseId}/tables`)

    const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
    const parsed = await parseAirtableApiResponse(response)

    // Support both shapes: array of tables or { tables: [...] }
    const tables: any[] = Array.isArray(parsed) ? parsed : (parsed?.tables || [])

    // Find the specific table by name or id
    const table = tables.find((t: any) => t?.name === tableName || t?.id === tableName)

    if (!table) {
      // Log available tables for debugging
      logger.debug(`🔍 Available tables in base "${baseId}":`, tables.map((t: any) => ({ id: t.id, name: t.name })))
      const availableTableNames = tables.map((t: any) => t?.name).filter(Boolean).join(', ') || 'none'
      throw new Error(`Table "${tableName}" not found in base "${baseId}". Available tables: ${availableTableNames}`)
    }

    // Extract field information
    let fields: AirtableFieldOption[] = table.fields?.map((field: any) => ({
      value: field.name,
      label: field.name,
      type: field.type,
      id: field.id
    })) || []

    // Filter out read-only fields if requested
    if (filterReadOnly) {
      const originalCount = fields.length
      fields = fields.filter(field => !READ_ONLY_FIELD_TYPES.includes(field.type))
      const filteredCount = originalCount - fields.length
      if (filteredCount > 0) {
        logger.debug(`🔍 Filtered out ${filteredCount} read-only fields (formula, count, rollup, etc.)`)
      }
    }

    logger.debug(`✅ Airtable fields fetched successfully: ${fields.length} fields from table "${tableName}"`)
    return fields
    
  } catch (error: any) {
    logger.error("Error fetching Airtable fields:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Airtable fields")
  }
}