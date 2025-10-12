/**
 * Trello Board Labels Handler
 */

import { TrelloIntegration, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

interface TrelloLabel {
  id: string
  name: string
  color: string
  idBoard: string
}

export const getTrelloBoardLabels: TrelloDataHandler<TrelloLabel> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloLabel[]> => {
  const { boardId } = options

  logger.debug("🔍 Trello board labels fetcher called with:", {
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
      logger.debug('⚠️ No board ID provided, returning empty labels array')
      return []
    }

    logger.debug('🔍 Fetching Trello board labels from API...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/labels?fields=id,name,color,idBoard`)

    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!, tokenResult.key)

    const labels = await parseTrelloApiResponse<TrelloLabel>(response)

    logger.debug(`✅ Trello board labels fetched successfully: ${labels.length} labels`)
    return labels

  } catch (error: any) {
    logger.error("Error fetching Trello board labels:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Trello board labels")
  }
}