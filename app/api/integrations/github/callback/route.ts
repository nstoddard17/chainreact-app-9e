import type { NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

/**
 * GitHub OAuth Callback Handler
 *
 * Handles the OAuth callback from GitHub.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Note: GitHub uses JSON format instead of form-urlencoded for token exchange.
 *
 * Updated: 2025-11-10 - Added email fetching from GitHub API
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'github',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/github/callback`,
    useJsonResponse: true, // GitHub needs Accept: application/json header
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(',') : [],
      expires_at: null, // GitHub tokens don't expire
    }),
    additionalIntegrationData: async (tokenData, state) => {
      // Fetch GitHub user information
      // API VERIFICATION: GitHub API endpoint for authenticated user
      // Docs: https://docs.github.com/en/rest/users/users#get-the-authenticated-user
      // Returns: login, email, name, id, etc.
      try {
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        })

        if (!userResponse.ok) {
          logger.warn('Failed to fetch GitHub user info:', userResponse.status)
          return {}
        }

        const userData = await userResponse.json()

        // GitHub may not return email in main user object if user has private email
        // Fetch user emails separately
        let primaryEmail = userData.email
        if (!primaryEmail) {
          try {
            const emailsResponse = await fetch('https://api.github.com/user/emails', {
              headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            })

            if (emailsResponse.ok) {
              const emails = await emailsResponse.json()
              const primary = emails.find((e: any) => e.primary)
              primaryEmail = primary?.email || (emails.length > 0 ? emails[0].email : null)
            }
          } catch (emailError) {
            logger.warn('Failed to fetch GitHub emails:', emailError)
          }
        }

        return {
          email: primaryEmail,
          username: userData.login,
          account_name: userData.name || userData.login,
          provider_user_id: userData.id?.toString(),
          github_login: userData.login,
          avatar_url: userData.avatar_url,
        }
      } catch (error) {
        logger.error('Error fetching GitHub user info:', error)
        return {}
      }
    },
  })
}
