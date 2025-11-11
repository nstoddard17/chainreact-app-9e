import { type NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

/**
 * OneDrive OAuth Callback Handler
 *
 * Handles the OAuth callback from Microsoft for OneDrive integration.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'onedrive',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: process.env.ONEDRIVE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.ONEDRIVE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/onedrive/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    additionalIntegrationData: async (tokenData, state) => {
      // Fetch user info from Microsoft Graph API
      // API VERIFICATION: Microsoft Graph API endpoints
      // User endpoint: https://learn.microsoft.com/en-us/graph/api/user-get
      // Photo endpoint: https://learn.microsoft.com/en-us/graph/api/profilephoto-get
      // Returns: id, mail, userPrincipalName, displayName, etc.
      try {
        const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`
          }
        })

        if (userResponse.ok) {
          const userData = await userResponse.json()
          const email = userData.mail || userData.userPrincipalName || null

          // Try to get profile photo URL
          let avatarUrl: string | null = null
          try {
            const photoMetaResponse = await fetch("https://graph.microsoft.com/v1.0/me/photo", {
              headers: {
                "Authorization": `Bearer ${tokenData.access_token}`
              }
            })
            if (photoMetaResponse.ok) {
              avatarUrl = `https://graph.microsoft.com/v1.0/me/photo/$value`
            }
          } catch (photoError) {
            logger.debug("Microsoft Graph photo not available for user")
          }

          return {
            email: email,
            username: userData.userPrincipalName || email,
            account_name: userData.displayName || email,
            provider_user_id: userData.id,
            avatar_url: avatarUrl,
          }
        } else {
          logger.warn("Failed to fetch OneDrive user info:", userResponse.status)
        }
      } catch (error) {
        logger.error("Error fetching OneDrive user info:", error)
      }

      return {}
    },
  })
}
