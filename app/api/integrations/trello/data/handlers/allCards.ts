/**
 * Trello All Cards Handler - Get all cards from a board
 */

import { TrelloIntegration, TrelloCard, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getTrelloAllCards: TrelloDataHandler<TrelloCard> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloCard[]> => {
  const { boardId } = options

  logger.debug("🔍 Trello all cards fetcher called with:", {
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
      logger.debug('⚠️ No board ID provided, returning empty cards array')
      return []
    }

    logger.debug('🔍 Fetching all Trello cards from board...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/cards?fields=id,name,idList,desc,due,closed`)

    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!, tokenResult.key)

    const cards = await parseTrelloApiResponse<TrelloCard>(response)

    logger.debug(`✅ All Trello cards fetched successfully: ${cards.length} cards`)
    return cards

  } catch (error: any) {
    logger.error("Error fetching all Trello cards:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching all Trello cards")
  }
}