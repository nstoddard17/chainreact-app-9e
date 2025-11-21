import { type NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

/**
 * Microsoft Excel OAuth Callback Handler
 *
 * Handles the OAuth callback from Microsoft for Excel integration.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Microsoft Excel uses Microsoft Graph API for spreadsheet operations.
 * This is a separate integration from OneDrive to allow independent connections.
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'microsoft-excel',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: process.env.MICROSOFT_EXCEL_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.MICROSOFT_EXCEL_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/microsoft-excel/callback`,
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
          logger.warn("Failed to fetch Microsoft Excel user info:", userResponse.status)
        }
      } catch (error) {
        logger.error("Error fetching Microsoft Excel user info:", error)
      }

      return {}
    },
  })
}
