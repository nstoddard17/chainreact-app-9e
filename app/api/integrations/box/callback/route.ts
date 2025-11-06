import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'

/**
 * Box OAuth Callback Handler
 *
 * Handles the OAuth callback from Box.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'box',
    tokenEndpoint: 'https://api.box.com/oauth2/token',
    clientId: process.env.BOX_CLIENT_ID!,
    clientSecret: process.env.BOX_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/box/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    additionalIntegrationData: async (tokenData) => {
      // Fetch Box user information
      try {
        const userResponse = await fetch('https://api.box.com/2.0/users/me', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`
          }
        })

        if (userResponse.ok) {
          const userData = await userResponse.json()
          return {
            email: userData.login || null,
            username: userData.name || null,
            account_name: userData.name || userData.login || null,
            box_user_id: userData.id
          }
        }
      } catch (error) {
        // Log error but don't fail the integration
        console.warn('Failed to fetch Box user info:', error)
      }

      return {}
    }
  })
}
