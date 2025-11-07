/**
 * Trello Cards Handler
 */

import { TrelloIntegration, TrelloCard, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getTrelloCards: TrelloDataHandler<TrelloCard> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloCard[]> => {
  const { boardId, listId } = options

  try {
    // Validate integration status
    validateTrelloIntegration(integration)

    const tokenResult = await validateTrelloToken(integration)

    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Authentication failed")
    }

    // If listId is provided, fetch cards from that specific list
    // Otherwise, require boardId to fetch all cards from the board
    let apiUrl: string

    if (listId) {
      apiUrl = buildTrelloApiUrl(`/1/lists/${listId}/cards?fields=id,name,desc,idList,closed`)
    } else if (boardId) {
      apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/cards?fields=id,name,desc,idList,closed`)
    } else {
      throw new Error('Either Board ID or List ID is required for fetching cards')
    }

    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!, tokenResult.key)
    const cards = await parseTrelloApiResponse<TrelloCard>(response)

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