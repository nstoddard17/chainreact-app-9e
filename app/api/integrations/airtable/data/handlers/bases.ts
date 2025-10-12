/**
 * Airtable Bases Handler
 */

import { AirtableIntegration, AirtableBase, AirtableDataHandler } from '../types'
import { validateAirtableIntegration, validateAirtableToken, makeAirtableApiRequest, parseAirtableApiResponse, buildAirtableApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getAirtableBases: AirtableDataHandler<AirtableBase> = async (integration: AirtableIntegration, options: any = {}): Promise<AirtableBase[]> => {
  logger.debug("🔍 Airtable bases fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
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
    
    logger.debug('🔍 Fetching Airtable bases from API...')
    const apiUrl = buildAirtableApiUrl('/v0/meta/bases')
    
    const response = await makeAirtableApiRequest(apiUrl, tokenResult.token!)
    
    const bases = await parseAirtableApiResponse<AirtableBase>(response)
    
    // Transform bases to match expected format
    const transformedBases = bases.map((base: any) => ({
      id: base.id,
      name: base.name,
      permissionLevel: base.permissionLevel || 'read'
    }))
    
    logger.debug(`✅ Airtable bases fetched successfully: ${transformedBases.length} bases`)
    return transformedBases
    
  } catch (error: any) {
    logger.error("Error fetching Airtable bases:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Airtable authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Airtable API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Airtable bases")
  }
}