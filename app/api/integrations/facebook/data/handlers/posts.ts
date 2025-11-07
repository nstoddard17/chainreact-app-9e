/**
 * Facebook Posts Handler
 */

import { FacebookIntegration, FacebookDataHandler, FacebookPost } from '../types'
import { makeFacebookApiRequest, validateFacebookToken } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getFacebookPosts: FacebookDataHandler<FacebookPost> = async (integration: FacebookIntegration, options: any = {}) => {
  try {
    const { pageId } = options

    if (!pageId) {
      logger.debug('❌ [Facebook Posts] No pageId provided')
      return []
    }

    logger.debug("🔍 [Facebook Posts] Fetching posts for page:", {
      integrationId: integration.id,
      pageId,
      hasToken: !!integration.access_token
    })

    // Validate and get token
    const tokenResult = await validateFacebookToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ [Facebook Posts] Token validation failed: ${tokenResult.error}`)
      return []
    }

    // Fetch posts from the page
    // Request message, created_time, type, and other relevant fields
    logger.debug("🔍 [Facebook Posts] Making Facebook API call")
    const response = await makeFacebookApiRequest(
      `https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,created_time,type&limit=50`,
      tokenResult.token!
    )

    if (!response.ok) {
      if (response.status === 401) {
        logger.debug("❌ [Facebook Posts] API returned 401 - token may be invalid")
        return []
      }
      const errorData = await response.json().catch(() => ({}))
      logger.error(`❌ [Facebook Posts] API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      return []
    }

    const data = await response.json()
    logger.debug("✅ [Facebook Posts] API response:", {
      postCount: data.data?.length || 0
    })

    const posts = (data.data || []).map((post: any) => ({
      id: post.id,
      message: post.message,
      created_time: post.created_time,
      type: post.type || 'status',
    }))

    logger.debug(`✅ [Facebook Posts] Processed ${posts.length} posts`)
    return posts
  } catch (error: any) {
    logger.error("❌ [Facebook Posts] Error fetching posts:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Facebook authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Facebook API rate limit exceeded. Please try again later.')
    }

    // Return empty array instead of throwing to prevent breaking the UI
    logger.warn("⚠️ [Facebook Posts] Returning empty array to prevent UI breakage")
    return []
  }
}
