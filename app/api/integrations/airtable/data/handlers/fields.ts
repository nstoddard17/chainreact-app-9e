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

export const getAirtableFields: AirtableDataHandler<AirtableFieldOption> = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableFieldOption[]> => {
  const { baseId, tableName } = options
  
  logger.debug("🔍 Airtable fields fetcher called with:", {
    integrationId: integration.id,
    baseId,
    tableName,
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
    const fields: AirtableFieldOption[] = table.fields?.map((field: any) => ({
      value: field.name,
      label: field.name,
      type: field.type,
      id: field.id
    })) || []
    
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