/**
 * Trello Board Members Handler
 */

import { TrelloIntegration, TrelloDataHandler, TrelloHandlerOptions } from '../types'
import { validateTrelloIntegration, validateTrelloToken, makeTrelloApiRequest, parseTrelloApiResponse, buildTrelloApiUrl } from '../utils'

interface TrelloMember {
  id: string
  username: string
  fullName: string
  initials?: string
  avatarUrl?: string
}

export const getTrelloBoardMembers: TrelloDataHandler<TrelloMember> = async (integration: TrelloIntegration, options: TrelloHandlerOptions = {}): Promise<TrelloMember[]> => {
  const { boardId } = options

  console.log("🔍 Trello board members fetcher called with:", {
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
      console.log('⚠️ No board ID provided, returning empty members array')
      return []
    }

    console.log('🔍 Fetching Trello board members from API...')
    const apiUrl = buildTrelloApiUrl(`/1/boards/${boardId}/members?fields=id,username,fullName,initials,avatarUrl`)

    const response = await makeTrelloApiRequest(apiUrl, tokenResult.token!)

    const members = await parseTrelloApiResponse<TrelloMember>(response)

    console.log(`✅ Trello board members fetched successfully: ${members.length} members`)
    return members

  } catch (error: any) {
    console.error("Error fetching Trello board members:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Trello authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Trello API rate limit exceeded. Please try again later.')
    }

    throw new Error(error.message || "Error fetching Trello board members")
  }
}