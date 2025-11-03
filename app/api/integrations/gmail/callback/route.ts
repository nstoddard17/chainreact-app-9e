import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

export const maxDuration = 30

/**
 * Gmail OAuth Callback Handler
 *
 * Handles the OAuth callback from Google for Gmail integration.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Updated: 2025-11-03 - Added email address fetching for account identification
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'gmail',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/gmail/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    additionalIntegrationData: async (tokenData) => {
      // Fetch user's email from Google userinfo endpoint
      try {
        const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        })

        if (userinfoResponse.ok) {
          const userinfo = await userinfoResponse.json()
          logger.debug('Gmail userinfo fetched:', { email: userinfo.email, id: userinfo.id })

          return {
            email: userinfo.email,
            account_name: userinfo.name || userinfo.email,
            google_id: userinfo.id,
            picture: userinfo.picture,
          }
        } else {
          logger.warn('Failed to fetch Gmail userinfo:', userinfoResponse.status)
          return {}
        }
      } catch (error) {
        logger.error('Error fetching Gmail userinfo:', error)
        return {}
      }
    },
  })
}
