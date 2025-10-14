/**
 * Blackbaud Constituents Handler
 */

import { BlackbaudIntegration, BlackbaudConstituent, BlackbaudDataHandler } from '../types'
import { validateBlackbaudIntegration, validateBlackbaudToken, makeBlackbaudApiRequest, parseBlackbaudApiResponse, buildBlackbaudApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getBlackbaudConstituents: BlackbaudDataHandler<BlackbaudConstituent> = async (integration: BlackbaudIntegration, options: any = {}): Promise<BlackbaudConstituent[]> => {
  logger.debug("🔍 Blackbaud constituents fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
  })
  
  try {
    // Validate integration status
    validateBlackbaudIntegration(integration)
    
    logger.debug(`🔍 Validating Blackbaud subscription key...`)
    const tokenResult = await validateBlackbaudToken(integration)
    
    if (!tokenResult.success) {
      logger.debug(`❌ Blackbaud token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    logger.debug('🔍 Fetching Blackbaud constituents...')
    
    const { limit = 100, offset = 0 } = options
    const apiUrl = buildBlackbaudApiUrl('/constituent/v1/constituents')
    
    // Add query parameters if needed
    const params = new URLSearchParams()
    if (limit) params.append('limit', limit.toString())
    if (offset) params.append('offset', offset.toString())
    
    const fullUrl = params.toString() ? `${apiUrl}?${params.toString()}` : apiUrl
    
    const response = await makeBlackbaudApiRequest(fullUrl, tokenResult.token!)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error(`❌ Blackbaud API error: ${response.status}`, errorData)
      
      if (response.status === 401) {
        throw new Error('Blackbaud authentication expired. Please reconnect your account.')
      } else {
        throw new Error(`Blackbaud API error: ${response.status} - ${errorData.message || "Unknown error"}`)
      }
    }
    
    const data = await response.json()
    
    // Transform constituents to expected format
    const constituents = (data.value || []).map((constituent: any) => ({
      value: constituent.id,
      label: `${constituent.first_name || ''} ${constituent.last_name || ''}`.trim() || 'Unknown',
      id: constituent.id,
      first_name: constituent.first_name,
      last_name: constituent.last_name,
      email_address: constituent.email_address,
      description: constituent.email_address,
      type: constituent.type,
      phone: constituent.phone,
      address: constituent.address,
      birth_date: constituent.birth_date,
      marital_status: constituent.marital_status,
      gender: constituent.gender
    }))
    
    logger.debug(`✅ Blackbaud constituents fetched successfully: ${constituents.length} constituents`)
    return constituents
    
  } catch (error: any) {
    logger.error("Error fetching Blackbaud constituents:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Blackbaud authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Blackbaud API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Blackbaud constituents")
  }
}