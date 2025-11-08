/**
 * Facebook Albums Handler
 */

import { FacebookIntegration, FacebookDataHandler } from '../types'
import { makeFacebookApiRequest, validateFacebookToken } from '../utils'

import { logger } from '@/lib/utils/logger'

export interface FacebookAlbum {
  id: string
  name: string
  value: string
  count?: number
  created_time?: string
}

export const getFacebookAlbums: FacebookDataHandler<FacebookAlbum> = async (integration: FacebookIntegration, options: any = {}) => {
  try {
    const { pageId } = options

    if (!pageId) {
      logger.debug('❌ [Facebook Albums] No pageId provided')
      return []
    }

    logger.debug("🔍 [Facebook Albums] Fetching albums for page:", {
      integrationId: integration.id,
      pageId,
      hasToken: !!integration.access_token
    })

    // Validate and get token
    const tokenResult = await validateFacebookToken(integration)

    if (!tokenResult.success) {
      logger.debug(`❌ [Facebook Albums] Token validation failed: ${tokenResult.error}`)
      return []
    }

    // Fetch albums from the page
    // Request id, name, count (photo count), created_time
    logger.debug("🔍 [Facebook Albums] Making Facebook API call")
    const response = await makeFacebookApiRequest(
      `https://graph.facebook.com/v19.0/${pageId}/albums?fields=id,name,count,created_time&limit=100`,
      tokenResult.token!
    )

    if (!response.ok) {
      if (response.status === 401) {
        logger.debug("❌ [Facebook Albums] API returned 401 - token may be invalid")
        return []
      }
      const errorData = await response.json().catch(() => ({}))
      logger.error(`❌ [Facebook Albums] API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      return []
    }

    const data = await response.json()
    logger.debug("✅ [Facebook Albums] API response:", {
      albumCount: data.data?.length || 0
    })

    // Filter out any "Timeline Photos" from the API response to avoid duplicates
    // (we'll add our own at the top)
    // Note: Case-insensitive check because Facebook may return "Timeline photos" or "Timeline Photos"
    const albums = (data.data || [])
      .filter((album: any) => album.name?.toLowerCase() !== 'timeline photos')
      .map((album: any) => ({
        id: album.id,
        name: album.name,
        value: album.id,
        count: album.count,
        created_time: album.created_time,
      }))

    // Add "Timeline Photos" as the first option (default album)
    // Note: Empty value means upload to Timeline Photos (user's default album)
    const albumsWithDefault = [
      {
        id: '',
        name: 'Timeline Photos',
        value: '', // Empty value means use default Timeline Photos
        count: undefined,
        created_time: undefined,
      },
      ...albums
    ]

    logger.debug(`✅ [Facebook Albums] Processed ${albumsWithDefault.length} albums (including Timeline Photos)`)
    return albumsWithDefault
  } catch (error: any) {
    logger.error("❌ [Facebook Albums] Error fetching albums:", error)

    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Facebook authentication expired. Please reconnect your account.')
    }

    if (error.message?.includes('rate limit')) {
      throw new Error('Facebook API rate limit exceeded. Please try again later.')
    }

    // Return empty array instead of throwing to prevent breaking the UI
    logger.warn("⚠️ [Facebook Albums] Returning empty array to prevent UI breakage")
    return []
  }
}
