/**
 * Trello Board Members Handler
 */

import { TrelloIntegration, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

import { logger } from '@/lib/utils/logger'

interface TrelloMember {
  id: string
  username: string
  fullName: string
  initials?: string
  avatarUrl?: string
}

export const getTrelloBoardMembers: TrelloDataHandler<TrelloMember> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloMember[]> => {
  const { boardId } = options

  logger.debug("🔍 Trello board members fetcher called with:", {
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
      logger.debug('⚠️ No board ID provided, returning empty members array')
      return []
    }

    logger.debug('🔍 Fetching Trello board members from API...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/members?fields=id,username,fullName,initials,avatarUrl`)

    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!, tokenResult.key)

    const members = await parseTrelloApiResponse<TrelloMember>(response)

    logger.debug(`✅ Trello board members fetched successfully: ${members.length} members`)
    return members

  } catch (error: any) {
    logger.error("Error fetching Trello board members:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Trello board members")
  }
}