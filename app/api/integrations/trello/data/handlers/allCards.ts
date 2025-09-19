/**
 * Trello All Cards Handler - Get all cards from a board
 */

import { TrelloIntegration, TrelloCard, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

export const getTrelloAllCards: TrelloDataHandler<TrelloCard> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloCard[]> => {
  const { boardId } = options

  console.log("🔍 Trello all cards fetcher called with:", {
    integrationId: integration.id,
    boardId,
    hasToken: !!integration.access_token
  })

  try {
    // Validate integration status
    validateTrelloIntegration(integration)

    console.log(`🔍 Validating Trello token...`)
    const tokenResult = await validateTrelloToken(integration)

    if (!tokenResult.success) {
      console.log(`❌ Trello token validation failed: ${tokenResult.error}`)
      throw new Error(tokenResult.error || "Authentication failed")
    }

    if (!boardId) {
      console.log('⚠️ No board ID provided, returning empty cards array')
      return []
    }

    console.log('🔍 Fetching all Trello cards from board...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/cards?fields=id,name,idList,desc,due,closed`)

    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!)

    const cards = await parseTrelloApiResponse<TrelloCard>(response)

    console.log(`✅ All Trello cards fetched successfully: ${cards.length} cards`)
    return cards

  } catch (error: any) {
    console.error("Error fetching all Trello cards:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching all Trello cards")
  }
}