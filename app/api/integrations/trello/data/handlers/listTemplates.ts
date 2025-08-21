/**
 * Trello List Templates Handler
 */

import { TrelloIntegration, TrelloListTemplate, TrelloDataHandler } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

export const getTrelloListTemplates: TrelloDataHandler<TrelloListTemplate> = async (integration: TrelloIntegration, options: any = {}): Promise<TrelloListTemplate[]> => {
  console.log("🔍 Trello list templates fetcher called with integration:", {
    id: integration.id,
    provider: integration.provider,
    hasToken: !!integration.access_token,
    tokenLength: integration.access_token?.length
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
    
    console.log('🔍 Fetching Trello boards and their lists from API...')
    
    // First get all boards
    const boardsApiUrl = buildTrelloApiUrl('/1/members/me/boards?fields=id,name,desc,url,closed')
    const boardsResponse = await makeTrelloApiRequest(boardsApiUrl, tokenResult.token!)
    const boards = await parseTrelloApiResponse<any>(boardsResponse)
    
    const listTemplates: TrelloListTemplate[] = []
    
    // For each board, get its lists
    for (const board of boards) {
      if (board.closed) continue // Skip closed boards
      
      try {
        const listsApiUrl = buildTrelloApiUrl(`/1/boards/${board.id}/lists?fields=id,name,desc,closed`)
        const listsResponse = await makeTrelloApiRequest(listsApiUrl, tokenResult.token!)
        const lists = await parseTrelloApiResponse<any>(listsResponse)
        
        for (const list of lists) {
          if (list.closed) continue // Skip closed lists
          
          listTemplates.push({
            value: list.id,
            label: `${board.name} - ${list.name}`,
            description: list.desc || '',
            boardId: board.id,
            boardName: board.name,
            closed: list.closed || false
          })
        }
      } catch (error) {
        console.warn(`Failed to fetch lists for board ${board.id}:`, error)
        continue
      }
    }
    
    console.log(`✅ Trello list templates fetched successfully: ${listTemplates.length} lists`)
    return listTemplates
    
  } catch (error: any) {
    console.error("Error fetching Trello list templates:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Trello list templates")
  }
}