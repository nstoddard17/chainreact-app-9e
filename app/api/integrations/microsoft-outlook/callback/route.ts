import { type NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { logger } from '@/lib/utils/logger'

/**
 * Microsoft Outlook OAuth Callback Handler
 *
 * Handles the OAuth callback from Microsoft for Outlook integration.
 * Fetches user info and checks for personal vs work/school account.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl()

  return handleOAuthCallback(request, {
    provider: 'microsoft-outlook',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/microsoft-outlook/callback`,
    transformTokenData: (tokenData) => {
      // Microsoft refresh tokens typically expire in 90 days
      const refreshExpiresIn = tokenData.refresh_expires_in || 90 * 24 * 60 * 60

      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
        expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
      }
    },
    additionalIntegrationData: async (tokenData, state) => {
      let providerEmail: string | null = null
      let providerAccountName: string | null = null
      let providerUsername: string | null = null
      let providerUserId: string | null = null
      let avatarUrl: string | null = null
      let metadata: any = {}

      // Fetch user info to check account type and get profile photo
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
          const email = userData.mail || userData.userPrincipalName || ""

          providerUserId = userData.id || null
          providerEmail = email || null
          providerUsername = userData.userPrincipalName || email || null
          providerAccountName = userData.displayName || providerEmail

          // Fetch profile photo URL (Microsoft Graph provides photo as binary blob)
          // We'll get the $value URL which provides the actual photo
          try {
            const photoMetaResponse = await fetch("https://graph.microsoft.com/v1.0/me/photo", {
              headers: {
                "Authorization": `Bearer ${tokenData.access_token}`
              }
            })
            if (photoMetaResponse.ok) {
              // Photo exists, construct the URL to fetch it
              avatarUrl = `https://graph.microsoft.com/v1.0/me/photo/$value`
            }
          } catch (photoError) {
            // Photo might not be set for this user, that's okay
            logger.debug("Microsoft Graph photo not available for user")
          }

          // Check if this is a personal account
          const isPersonalAccount = !userData.userPrincipalName ||
                                    email.includes("outlook.com") ||
                                    email.includes("hotmail.com") ||
                                    email.includes("live.com") ||
                                    email.includes("gmail.com")

          if (isPersonalAccount) {
            logger.warn("⚠️ Personal Microsoft account detected:", email)
            logger.warn("   Outlook API may have limitations with personal accounts")

            metadata = {
              accountType: "personal",
              email: email,
              displayName: userData.displayName || null,
              provider_email: providerEmail,
              provider_account_name: providerAccountName,
              warning: "Some Outlook features may not work with personal Microsoft accounts. Consider using a work or school account for full functionality.",
              knownLimitation: true
            }
          } else {
            logger.debug("✅ Work/School account detected:", email)
            metadata = {
              accountType: "work",
              email: email,
              displayName: userData.displayName || null,
              provider_email: providerEmail,
              provider_account_name: providerAccountName
            }
          }
        }
      } catch (checkError) {
        logger.error("Could not check account type:", checkError)
      }

      // Calculate refresh token expiration (Microsoft default is 90 days)
      const refreshExpiresIn = tokenData.refresh_expires_in || 90 * 24 * 60 * 60
      const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

      return {
        email: providerEmail,
        username: providerUsername,
        account_name: providerAccountName,
        provider_user_id: providerUserId,
        avatar_url: avatarUrl,
        refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
        metadata
      }
    },
  })
}
