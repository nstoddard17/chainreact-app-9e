import type { NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { logger } from '@/lib/utils/logger'

/**
 * Microsoft Teams OAuth Callback Handler
 *
 * Handles the OAuth callback from Microsoft for Teams integration.
 * Validates that the user has a work/school account with Teams access.
 *
 * Updated: 2025-11-10 - Migrated to use oauth-callback-handler utility with email support
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl()

  return handleOAuthCallback(request, {
    provider: 'teams',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    clientId: process.env.TEAMS_CLIENT_ID!,
    clientSecret: process.env.TEAMS_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/teams/callback`,
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
      // Validate Teams account access
      // API VERIFICATION: Microsoft Graph API endpoint for current user
      // Docs: https://learn.microsoft.com/en-us/graph/api/user-get
      // Returns: id, mail, userPrincipalName, displayName, etc.
      logger.debug('🔍 Validating Teams account access...')

      try {
        const validationResponse = await fetch(`${baseUrl}/api/integrations/validate-teams-account`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            accessToken: tokenData.access_token
          })
        })

        const validationData = await validationResponse.json()
        logger.debug('🔍 Teams account validation result:', validationData)

        if (!validationData.success) {
          if (validationData.error === 'TEAMS_PERSONAL_ACCOUNT') {
            throw new Error(
              "Microsoft Teams integration requires a work or school account with Microsoft 365 subscription. " +
              "Personal Microsoft accounts (@outlook.com, @hotmail.com, etc.) are not supported. " +
              "Please use your work or school email address."
            )
          } else if (validationData.error === 'TEAMS_NO_ACCESS') {
            throw new Error(
              "Your work or school account does not have access to Microsoft Teams. " +
              "Please contact your administrator to enable Teams access or ensure you have a Microsoft 365 subscription."
            )
          }
          throw new Error("Failed to validate Teams account access. Please try again or contact support.")
        }

        // Extract user info from validation response
        const userInfo = validationData.userInfo || {}
        const email = userInfo.mail || userInfo.userPrincipalName || null
        const username = userInfo.userPrincipalName || email || null
        const accountName = userInfo.displayName || email || null

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

        // Calculate refresh token expiration (Microsoft default is 90 days)
        const refreshExpiresIn = tokenData.refresh_expires_in || 90 * 24 * 60 * 60
        const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

        return {
          email: email,
          username: username,
          account_name: accountName,
          provider_user_id: userInfo.id,
          avatar_url: avatarUrl,
          refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
          accountType: userInfo.accountType || 'work',
        }
      } catch (error: any) {
        logger.error("Error validating Teams account:", error)
        throw error
      }
    },
  })
}
