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
      // API VERIFICATION: Mailchimp OAuth metadata endpoint
      // Docs: https://mailchimp.com/developer/marketing/guides/access-user-data-oauth-2/
      // Endpoint: GET /oauth2/metadata
      // Returns: dc, accountname, login_url, api_endpoint
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

          // Fetch account details including email from API root
          // API VERIFICATION: Mailchimp API root endpoint for account details
          // Docs: https://mailchimp.com/developer/marketing/api/root/
          // Endpoint: GET /3.0/
          // Returns: account_id, account_name, email, contact (with email), etc.
          let email = null
          let accountName = metadataData.accountname || null

          if (metadataData.api_endpoint) {
            try {
              const accountResponse = await fetch(`${metadataData.api_endpoint}/3.0/`, {
                headers: {
                  Authorization: `OAuth ${tokenData.access_token}`,
                },
              })

              if (accountResponse.ok) {
                const accountData = await accountResponse.json()
                email = accountData.email || accountData.contact?.email || accountData.login?.email || null
                accountName = accountData.account_name || metadataData.accountname || null
                logger.debug('✅ Mailchimp account details fetched:', {
                  email,
                  accountName
                })
              } else {
                logger.warn('Failed to fetch Mailchimp account details:', await accountResponse.text())
              }
            } catch (accountError) {
              logger.warn('Error fetching Mailchimp account details:', accountError)
            }
          }

          return {
            email: email,
            username: email?.split('@')[0] || accountName,
            account_name: accountName || email,
            metadata: {
              dc: metadataData.dc, // Data center / server prefix
              accountname: metadataData.accountname,
              login_url: metadataData.login?.login_url,
              api_endpoint: metadataData.api_endpoint,
              // Keep in metadata for backward compatibility
              email: email,
              account_name: accountName,
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
