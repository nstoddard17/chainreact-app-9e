/**
 * Airtable Records Handler
 */

import { AirtableIntegration, AirtableRecord, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getAirtableRecords: AirtableDataHandler<AirtableRecord> = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableRecord[]> => {
  const { baseId, tableName, maxRecords = 100, view, filterByFormula, sort } = options
  
  logger.debug("🔍 Airtable records fetcher called with:", {
    integrationId: integration.id,
    baseId,
    tableName,
    maxRecords,
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
    
    if (!baseId) {
      throw new Error('Base ID is required for fetching records')
    }
    
    if (!tableName) {
      throw new Error('Table name is required for fetching records')
    }
    
    logger.debug('🔍 Fetching Airtable records from API...')
    
    // Build query parameters
    const queryParams = new URLSearchParams()
    if (maxRecords) queryParams.append('maxRecords', maxRecords.toString())
    if (view) queryParams.append('view', view)
    if (filterByFormula) queryParams.append('filterByFormula', filterByFormula)
    if (sort && sort.length > 0) {
      sort.forEach((s, index) => {
        queryParams.append(`sort[${index}][field]`, s.field)
        queryParams.append(`sort[${index}][direction]`, s.direction)
      })
    }
    
    const apiUrl = buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}?${queryParams.toString()}`)
    
    const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
    
    const records = await parseAirtableApiResponse<AirtableRecord>(response)
    
    logger.debug(`✅ Airtable records fetched successfully: ${records.length} records`)
    return records
    
  } catch (error: any) {
    logger.error("Error fetching Airtable records:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Airtable records")
  }
}