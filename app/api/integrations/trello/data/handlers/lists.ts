/**
 * Trello Lists Handler
 */

import { TrelloIntegration, TrelloList, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getTrelloLists: TrelloDataHandler<TrelloList> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloList[]> => {
  const { boardId } = options
  
  logger.debug("🔍 Trello lists fetcher called with:", {
    integrationId: integration.id,
    boardId,
    hasToken: !!integration.access_token
  })
  
  try {
    // Validate integration status
    validateTrelloIntegration(integration)
    
    logger.debug(`🔍 Validating Trello token...`)
    const tokenResult = await validateTrelloToken(integration)
    
    if (!tokenResult.success) {
      logger.debug(`❌ Trello token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    if (!boardId) {
      logger.debug('⚠️ No board ID provided, returning empty lists array')
      return []
    }
    
    logger.debug('🔍 Fetching Trello lists from API...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/lists?fields=id,name,closed`)
    
    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!, tokenResult.key)
    
    const lists = await parseTrelloApiResponse<TrelloList>(response)
    
    logger.debug(`✅ Trello lists fetched successfully: ${lists.length} lists`)
    return lists
    
  } catch (error: any) {
    logger.error("Error fetching Trello lists:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Trello lists")
  }
}