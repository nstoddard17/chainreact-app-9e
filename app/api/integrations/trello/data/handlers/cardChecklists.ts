/**
 * Trello Card Checklists Handler
 */

import { TrelloIntegration, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

interface TrelloChecklist {
  id: string
  name: string
  idCard: string
  pos: number
  checkItems?: any[]
}

export const getTrelloCardChecklists: TrelloDataHandler<TrelloChecklist> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloChecklist[]> => {
  const { cardId } = options

  try {
    // Validate integration status
    validateTrelloIntegration(integration)

    const tokenResult = await validateTrelloToken(integration)

    if (!tokenResult.success) {
      throw new Error(tokenResult.error || "Authentication failed")
    }

    if (!cardId) {
      logger.debug('⚠️ No card ID provided, returning empty checklists array')
      return []
    }

    logger.debug('🔍 Fetching Trello card checklists from API...', { cardId })
    const apiUrl = buildTrelloApiUrl(`/1/cards/${cardId}/checklists?fields=id,name,pos`)

    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!, tokenResult.key)
    const checklists = await parseTrelloApiResponse<TrelloChecklist>(response)

    logger.debug(`✅ Trello card checklists fetched successfully: ${checklists.length} checklists`)
    return checklists

  } catch (error: any) {
    logger.error("Error fetching Trello card checklists:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Trello card checklists")
  }
}
