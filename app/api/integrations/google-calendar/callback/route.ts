import type { NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

/**
 * Google Calendar OAuth Callback Handler
 *
 * Handles the OAuth callback from Google for Google Calendar integration.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 * Updated: 2025-11-10 - Added email fetching for deduplication
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'google-calendar',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/google-calendar/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    // Fetch user email for account identification and deduplication
    // API VERIFICATION: Google userinfo endpoint
    // Docs: https://developers.google.com/identity/protocols/oauth2/openid-connect
    // Endpoint: GET https://www.googleapis.com/oauth2/v2/userinfo
    // Returns: User object with email, name, picture, etc.
    additionalIntegrationData: async (tokenData, state) => {
      try {
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        })

        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json()
          logger.debug('✅ Google Calendar user info fetched:', {
            email: userInfo.email,
            name: userInfo.name,
          })

          return {
            email: userInfo.email,
            username: userInfo.email?.split('@')[0] || userInfo.name,
            account_name: userInfo.name || userInfo.email,
            provider_user_id: userInfo.id,
            picture: userInfo.picture,
          }
        } else {
          logger.warn('Failed to fetch Google user info:', await userInfoResponse.text())
          return {}
        }
      } catch (error) {
        logger.warn('Error fetching Google user info:', error)
        return {}
      }
    },
  })
}
