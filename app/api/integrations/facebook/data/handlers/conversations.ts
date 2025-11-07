/**
 * Facebook Conversations Handler
 */

import { FacebookIntegration, FacebookDataHandler, FacebookConversation } from '../types'
import { makeFacebookApiRequest, validateFacebookToken } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getFacebookConversations: FacebookDataHandler<FacebookConversation> = async (integration: FacebookIntegration, options: any = {}) => {
  try {
    const { pageId } = options

    if (!pageId) {
      logger.debug('❌ [Facebook Conversations] No pageId provided')
      return []
    }

    logger.debug("🔍 [Facebook Conversations] Fetching conversations for page:", {
      integrationId: integration.id,
      pageId,
      hasToken: !!integration.access_token
    })

    // Validate and get token
    const tokenResult = await validateFacebookToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ [Facebook Conversations] Token validation failed: ${tokenResult.error}`)
      return []
    }

    // Fetch conversations from the page
    // Request id, participants, updated_time, message_count
    logger.debug("🔍 [Facebook Conversations] Making Facebook API call")
    const response = await makeFacebookApiRequest(
      `https://graph.facebook.com/v19.0/${pageId}/conversations?fields=id,participants,updated_time,message_count&limit=50`,
      tokenResult.token!
    )

    if (!response.ok) {
      if (response.status === 401) {
        logger.debug("❌ [Facebook Conversations] API returned 401 - token may be invalid")
        return []
      }
      const errorData = await response.json().catch(() => ({}))
      logger.error(`❌ [Facebook Conversations] API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      return []
    }

    const data = await response.json()
    logger.debug("✅ [Facebook Conversations] API response:", {
      conversationCount: data.data?.length || 0
    })

    const conversations = (data.data || []).map((conv: any) => ({
      id: conv.id,
      participants: conv.participants?.data || [],
      updated_time: conv.updated_time,
      message_count: conv.message_count,
    }))

    logger.debug(`✅ [Facebook Conversations] Processed ${conversations.length} conversations`)
    return conversations
  } catch (error: any) {
    logger.error("❌ [Facebook Conversations] Error fetching conversations:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Facebook authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Facebook API rate limit exceeded. Please try again later.')
    }

    // Return empty array instead of throwing to prevent breaking the UI
    logger.warn("⚠️ [Facebook Conversations] Returning empty array to prevent UI breakage")
    return []
  }
}
