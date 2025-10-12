/**
 * Facebook Pages Handler
 */

import { FacebookIntegration, FacebookPage, FacebookDataHandler } from '../types'
import { makeFacebookApiRequest, validateFacebookToken } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getFacebookPages: FacebookDataHandler<FacebookPage> = async (integration: FacebookIntegration, options: any = {}) => {
  try {
    logger.debug("🔍 Facebook pages fetcher called with integration:", {
      id: integration.id,
      provider: integration.provider,
      hasToken: !!integration.access_token
    })
    
    // Validate and get token
    logger.debug("🔍 Validating Facebook token...")
    const tokenResult = await validateFacebookToken(integration)
    logger.debug("🔍 Token validation result:", {
      success: tokenResult.success,
      hasToken: !!tokenResult.token,
      tokenLength: tokenResult.token?.length || 0,
      tokenPreview: tokenResult.token ? `${tokenResult.token.substring(0, 20)}...` : 'none',
      error: tokenResult.error
    })
    
    if (!tokenResult.success) {
      logger.debug(`❌ Facebook token validation failed: ${tokenResult.error}`)
      return []
    }

    logger.debug("🔍 Making Facebook API call with appsecret_proof")
    const response = await makeFacebookApiRequest(
      'https://graph.facebook.com/v19.0/me/accounts',
      tokenResult.token!
    )

    if (!response.ok) {
      if (response.status === 401) {
        logger.debug("❌ Facebook API returned 401 - token may be invalid")
        return []
      }
      const errorData = await response.json().catch(() => ({}))
      logger.error(`Facebook API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      return []
    }

    const data = await response.json()
    logger.debug("🔍 Facebook API response:", data)
    
    const pages = (data.data || []).map((page: any) => ({
      id: page.id,
      name: page.name,
      value: page.id,
      access_token: page.access_token,
      category: page.category,
      tasks: page.tasks || [],
    }))
    
    logger.debug("🔍 Processed Facebook pages:", pages)
    return pages
  } catch (error: any) {
    logger.error("Error fetching Facebook pages:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Facebook authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Facebook API rate limit exceeded. Please try again later.')
    }
    
    // Return empty array instead of throwing to prevent breaking the UI
    logger.warn("Returning empty array to prevent UI breakage")
    return []
  }
}