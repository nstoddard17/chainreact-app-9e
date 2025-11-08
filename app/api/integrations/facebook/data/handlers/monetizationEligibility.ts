/**
 * Facebook Page Monetization Eligibility Handler
 * Checks if a page meets Facebook's video monetization requirements
 */

import { FacebookIntegration, FacebookDataHandler } from '../types'
import { makeFacebookApiRequest, validateFacebookToken } from '../utils'
import { logger } from '@/lib/utils/logger'

export interface MonetizationEligibility {
  pageId: string
  pageName: string
  eligible: boolean
  requirements: {
    hasMinFollowers: boolean | null  // 10,000+ followers required
    hasMinViewTime: boolean | null   // 600,000+ minutes viewed (last 60 days) required
    fromEligibleCountry: boolean | null
    meetsAllRequirements: boolean
  }
  followerCount?: number
  viewMinutes?: number
  country?: string
  message: string
}

export const getMonetizationEligibility: FacebookDataHandler<MonetizationEligibility> = async (
  integration: FacebookIntegration,
  options: { pageId?: string } = {}
) => {
  try {
    const { pageId } = options

    if (!pageId) {
      logger.error('[Facebook] Page ID required for monetization eligibility check')
      return []
    }

    logger.debug('[Facebook] Checking monetization eligibility for page:', pageId)

    // Validate and get token
    const tokenResult = await validateFacebookToken(integration)

    if (!tokenResult.success) {
      logger.error(`[Facebook] Token validation failed: ${tokenResult.error}`)
      return []
    }

    const token = tokenResult.token!

    // Fetch page details including follower count
    const pageResponse = await makeFacebookApiRequest(
      `https://graph.facebook.com/v19.0/${pageId}?fields=id,name,followers_count,country_page_likes`,
      token
    )

    if (!pageResponse.ok) {
      logger.error(`[Facebook] Failed to fetch page details: ${pageResponse.status}`)
      return []
    }

    const pageData = await pageResponse.json()
    const followerCount = pageData.followers_count || 0
    const pageName = pageData.name || 'Unknown Page'

    logger.debug('[Facebook] Page data:', {
      pageId,
      pageName,
      followerCount,
      hasCountryData: !!pageData.country_page_likes
    })

    // Check follower requirement (10,000+)
    const hasMinFollowers = followerCount >= 10000

    // Try to fetch video insights for view time
    // Note: This requires pages_read_engagement permission and may not be available for all pages
    let viewMinutes: number | undefined
    let hasMinViewTime: boolean | null = null

    try {
      const insightsResponse = await makeFacebookApiRequest(
        `https://graph.facebook.com/v19.0/${pageId}/insights/page_video_views_watched_minutes?period=day&since=${Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60)}`,
        token
      )

      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json()

        // Sum up total watch minutes from last 60 days
        if (insightsData.data && insightsData.data.length > 0) {
          const values = insightsData.data[0].values || []
          viewMinutes = values.reduce((sum: number, entry: any) => sum + (entry.value || 0), 0)
          hasMinViewTime = viewMinutes >= 600000

          logger.debug('[Facebook] Video insights:', { viewMinutes, hasMinViewTime })
        }
      } else {
        logger.debug('[Facebook] Could not fetch video insights (may require additional permissions)')
      }
    } catch (error) {
      logger.debug('[Facebook] Error fetching video insights:', error)
      // Continue without view time data
    }

    // Determine eligibility based on available data
    const meetsAllRequirements = hasMinFollowers && (hasMinViewTime !== false)

    // Generate helpful message
    let message = ''
    if (meetsAllRequirements && hasMinViewTime === true) {
      message = '✅ Page meets all monetization requirements!'
    } else if (!hasMinFollowers) {
      message = `❌ Need ${(10000 - followerCount).toLocaleString()} more followers (currently ${followerCount.toLocaleString()})`
    } else if (hasMinViewTime === false && viewMinutes !== undefined) {
      message = `❌ Need ${(600000 - viewMinutes).toLocaleString()} more watch minutes (currently ${viewMinutes.toLocaleString()})`
    } else if (hasMinViewTime === null) {
      message = `⚠️ ${followerCount.toLocaleString()} followers (10K required). Unable to verify watch time - requires additional permissions.`
    } else {
      message = 'Check page eligibility in Facebook Creator Studio'
    }

    const result: MonetizationEligibility = {
      pageId,
      pageName,
      eligible: meetsAllRequirements && hasMinViewTime === true,
      requirements: {
        hasMinFollowers,
        hasMinViewTime,
        fromEligibleCountry: null, // Facebook doesn't expose this via API
        meetsAllRequirements
      },
      followerCount,
      viewMinutes,
      message
    }

    logger.debug('[Facebook] Monetization eligibility result:', result)

    return [result]
  } catch (error: any) {
    logger.error('[Facebook] Error checking monetization eligibility:', error)
    return []
  }
}
