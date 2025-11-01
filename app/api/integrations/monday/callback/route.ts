import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'monday',
    tokenEndpoint: 'https://auth.monday.com/oauth2/token',
    clientId: process.env.MONDAY_CLIENT_ID!,
    clientSecret: process.env.MONDAY_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/monday/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    // Fetch additional user data from Monday.com for metadata
    additionalIntegrationData: async (tokenData, state) => {
      try {
        const userResponse = await fetch('https://api.monday.com/v2', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: 'query { me { id name email } }',
          }),
        })

        if (!userResponse.ok) {
          logger.warn('Failed to get Monday.com user info for metadata')
          return {}
        }

        const userData = await userResponse.json()
        const user = userData.data?.me

        if (!user) {
          logger.warn('User data not found in Monday.com response')
          return {}
        }

        return {
          provider_user_id: user.id,
          provider_user_email: user.email,
          provider_user_name: user.name,
        }
      } catch (error) {
        logger.warn('Error fetching Monday.com user data:', error)
        return {}
      }
    },
  })
}
