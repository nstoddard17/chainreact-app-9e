/**
 * Trello Card Templates Handler
 */

import { TrelloIntegration, TrelloCardTemplate, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getTrelloCardTemplates: TrelloDataHandler<TrelloCardTemplate> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloCardTemplate[]> => {
  const { boardId, listId } = options
  
  logger.debug(`🔍 Fetching trello-card-templates with options:`, options)
  
  try {
    // Validate integration status
    validateTrelloIntegration(integration)
    
    logger.debug(`🔍 Validating Trello token...`)
    const tokenResult = await validateTrelloToken(integration)
    
    if (!tokenResult.success) {
      logger.debug(`❌ Trello token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }
    
    let cards: any[] = []
    
    if (boardId) {
      // Fetch cards from specific board
      logger.debug('🔍 Fetching cards from specific board...')
      const cardsApiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/cards?fields=id,name,desc,idList,idBoard,labels,closed`)
      const cardsResponse = await makeTrelloApiRequest(cardsApiUrl, tokenResult.token!, tokenResult.key)
      cards = await parseTrelloApiResponse<any>(cardsResponse)
    } else {
      // Fetch cards from all boards
      logger.debug('🔍 Fetching cards from all boards...')
      const cardsApiUrl = buildTrelloApiUrl('/1/members/me/cards?fields=id,name,desc,idList,idBoard,labels,closed')
      const cardsResponse = await makeTrelloApiRequest(cardsApiUrl, tokenResult.token!, tokenResult.key)
      cards = await parseTrelloApiResponse<any>(cardsResponse)
    }
    
    const cardTemplates: TrelloCardTemplate[] = []
    
    // For each card, get board and list names
    for (const card of cards) {
      if (card.closed) continue // Skip closed cards
      
      try {
        // Get board name
        const boardApiUrl = buildTrelloApiUrl(`/1/boards/${card.idBoard}?fields=name`)
        const boardResponse = await makeTrelloApiRequest(boardApiUrl, tokenResult.token!, tokenResult.key)
        const boardData = await boardResponse.json()
        
        // Get list name
        const listApiUrl = buildTrelloApiUrl(`/1/lists/${card.idList}?fields=name,idBoard`)
        const listResponse = await makeTrelloApiRequest(listApiUrl, tokenResult.token!, tokenResult.key)
        const listData = await listResponse.json()
        
        cardTemplates.push({
          value: card.id,
          label: card.name,
          description: card.desc || '',
          listId: card.idList,
          listName: listData.name || 'Unknown List',
          boardId: card.idBoard,
          boardName: boardData.name || 'Unknown Board',
          labels: card.labels || [],
          closed: card.closed || false
        })
      } catch (error) {
        logger.warn(`Failed to fetch metadata for card ${card.id}:`, error)
        continue
      }
    }
    
    logger.debug(`✅ Trello card templates fetched successfully: ${cardTemplates.length} cards`)
    return cardTemplates
    
  } catch (error: any) {
    logger.error("Error fetching Trello card templates:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Trello card templates")
  }
}