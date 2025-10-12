/**
 * Trello Cards Handler
 */

import { TrelloIntegration, TrelloCard, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getTrelloCards: TrelloDataHandler<TrelloCard> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloCard[]> => {
  logger.debug("🔍 Trello cards fetcher - RAW OPTIONS:", options)
  const { boardId } = options

  logger.debug("🔍 Trello cards fetcher called with:", {
    integrationId: integration.id,
    boardId,
    hasToken: !!integration.access_token,
    allOptions: options
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
      throw new Error('Board ID is required for fetching cards')
    }
    
    logger.debug('🔍 Fetching Trello cards from API...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/cards?fields=id,name,desc,idList,closed`)
    
    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!, tokenResult.key)
    
    const cards = await parseTrelloApiResponse<TrelloCard>(response)
    
    logger.debug(`✅ Trello cards fetched successfully: ${cards.length} cards`)
    return cards
    
  } catch (error: any) {
    logger.error("Error fetching Trello cards:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Trello cards")
  }
}