import { NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

/**
 * Mailchimp OAuth Callback Handler
 *
 * Handles the OAuth callback from Mailchimp.
 * Fetches metadata to get the server prefix (dc) for API calls.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'mailchimp',
    tokenEndpoint: 'https://login.mailchimp.com/oauth2/token',
    clientId: process.env.MAILCHIMP_CLIENT_ID!,
    clientSecret: process.env.MAILCHIMP_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/mailchimp/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: null, // Mailchimp doesn't use refresh tokens
      scopes: ['campaigns', 'audience', 'automation', 'root'],
      expires_at: null, // Mailchimp tokens don't expire (permanent until revoked)
    }),
    additionalIntegrationData: async (tokenData, state) => {
      // Fetch Mailchimp metadata to get the server prefix (dc)
      try {
        const metadataResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
          headers: {
            Authorization: `OAuth ${tokenData.access_token}`,
          },
        })

        if (metadataResponse.ok) {
          const metadataData = await metadataResponse.json()
          logger.debug('✅ Mailchimp metadata fetched:', {
            dc: metadataData.dc,
            accountname: metadataData.accountname
          })

          return {
            metadata: {
              dc: metadataData.dc, // Data center / server prefix
              accountname: metadataData.accountname,
              login_url: metadataData.login?.login_url,
              api_endpoint: metadataData.api_endpoint,
            }
          }
        } else {
          logger.error('Failed to fetch Mailchimp metadata:', await metadataResponse.text())
          return { metadata: {} }
        }
      } catch (error) {
        logger.error('Error fetching Mailchimp metadata:', error)
        return { metadata: {} }
      }
    },
  })
}
