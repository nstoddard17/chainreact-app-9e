/**
 * Trello Board Labels Handler
 */

import { TrelloIntegration, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

interface TrelloLabel {
  id: string
  name: string
  color: string
  idBoard: string
}

export const getTrelloBoardLabels: TrelloDataHandler<TrelloLabel> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloLabel[]> => {
  const { boardId } = options

  console.log("🔍 Trello board labels fetcher called with:", {
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
      console.log('⚠️ No board ID provided, returning empty labels array')
      return []
    }

    console.log('🔍 Fetching Trello board labels from API...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/labels?fields=id,name,color,idBoard`)

    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!)

    const labels = await parseTrelloApiResponse<TrelloLabel>(response)

    console.log(`✅ Trello board labels fetched successfully: ${labels.length} labels`)
    return labels

  } catch (error: any) {
    console.error("Error fetching Trello board labels:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Trello board labels")
  }
}