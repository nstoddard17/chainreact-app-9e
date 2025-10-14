/**
 * Airtable Feedback Records Handler
 */

import { AirtableIntegration, AirtableFeedbackRecord, AirtableDataHandler, AirtableHandlerOptions } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getAirtableFeedbackRecords: AirtableDataHandler<AirtableFeedbackRecord> = async (integration: AirtableIntegration, options: AirtableHandlerOptions = {}): Promise<AirtableFeedbackRecord[]> => {
  const { baseId } = options
  
  logger.debug("🔍 Airtable feedback records fetcher called with:", {
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
      throw new Error('Base ID is required for fetching feedback records')
    }
    
    logger.debug('🔍 Fetching Airtable feedback records from API...')
    
    // Try common feedback table names
    const possibleTableNames = ['Feedback', 'User Feedback', 'Customer Feedback', 'Reviews', 'Comments']
    let records: AirtableFeedbackRecord[] = []
    
    for (const tableName of possibleTableNames) {
      try {
        const apiUrl = buildAirtableApiUrl(`/v0/${baseId}/${encodeURIComponent(tableName)}?maxRecords=100`)
        const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
        
        if (response.ok) {
          const tableRecords = await parseAirtableApiResponse<AirtableFeedbackRecord>(response)
          logger.debug(`✅ Found feedback table: ${tableName} with ${tableRecords.length} records`)
          records = tableRecords
          break
        }
      } catch (error) {
        logger.debug(`❌ Table ${tableName} not found, trying next...`)
        continue
      }
    }
    
    if (records.length === 0) {
      logger.debug('📝 No feedback table found, returning empty array')
    }
    
    logger.debug(`✅ Airtable feedback records fetched successfully: ${records.length} records`)
    return records
    
  } catch (error: any) {
    logger.error("Error fetching Airtable feedback records:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Airtable feedback records")
  }
}