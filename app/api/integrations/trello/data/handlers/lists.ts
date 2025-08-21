/**
 * Trello Lists Handler
 */

import { TrelloIntegration, TrelloList, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

export const getTrelloLists: TrelloDataHandler<TrelloList> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloList[]> => {
  const { boardId } = options
  
  console.log("🔍 Trello lists fetcher called with:", {
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
      throw new Error('Board ID is required for fetching lists')
    }
    
    console.log('🔍 Fetching Trello lists from API...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/lists?fields=id,name,closed`)
    
    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!)
    
    const lists = await parseTrelloApiResponse<TrelloList>(response)
    
    console.log(`✅ Trello lists fetched successfully: ${lists.length} lists`)
    return lists
    
  } catch (error: any) {
    console.error("Error fetching Trello lists:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Trello lists")
  }
}