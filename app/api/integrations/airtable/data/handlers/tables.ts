/**
 * Airtable Tables Handler
 */

import { AirtableIntegration, AirtableTable, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getAirtableTables: AirtableDataHandler<AirtableTable> = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableTable[]> => {
  const { baseId } = options
  
  logger.debug("🔍 Airtable tables fetcher called with:", {
    integrationId: integration.id,
    baseId,
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
      throw new Error('Base ID is required for fetching tables')
    }
    
    logger.debug('🔍 Fetching Airtable tables from API...')
    const apiUrl = buildAirtableApiUrl(`/v0/meta/bases/${baseId}/tables`)
    
    const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
    
    const tables = await parseAirtableApiResponse<AirtableTable>(response)
    
    logger.debug(`✅ Airtable tables fetched successfully: ${tables.length} tables from base "${baseId}"`)
    logger.debug(`🔍 Available tables:`, tables.map(t => ({ id: t.id, name: t.name })))
    return tables
    
  } catch (error: any) {
    logger.error("Error fetching Airtable tables:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Airtable tables")
  }
}