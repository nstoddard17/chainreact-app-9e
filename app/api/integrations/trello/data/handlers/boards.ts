/**
 * Trello Boards Handler
 */

import { TrelloIntegration, TrelloBoardTemplate, TrelloDataHandler } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

export const getTrelloBoards: TrelloDataHandler<TrelloBoardTemplate> = async (integration: TrelloIntegration, options: any = {}): Promise<TrelloBoardTemplate[]> => {
  console.log("🔍 Trello boards fetcher called with integration:", {
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
    
    console.log('🔍 Fetching Trello boards from API...')
    const apiUrl = buildTrelloApiUrl('/1/members/me/boards?fields=id,name,desc,url,closed')
    
    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!)
    
    const boards = await parseTrelloApiResponse<any>(response)
    
    // Transform boards to match expected template format
    const boardTemplates: TrelloBoardTemplate[] = boards.map((board: any) => ({
      value: board.id,
      label: board.name,
      description: board.desc || '',
      url: board.url,
      closed: board.closed || false
    }))
    
    console.log(`✅ Trello boards fetched successfully: ${boardTemplates.length} boards`)
    return boardTemplates
    
  } catch (error: any) {
    console.error("Error fetching Trello boards:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(error.message || "Error fetching Trello boards")
  }
}