import type { NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { logger } from '@/lib/utils/logger'

/**
 * HubSpot OAuth Callback Handler
 *
 * Handles the OAuth callback from HubSpot.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Note: HubSpot may show additional verification screens during OAuth flow.
 * The centralized handler properly waits for complete authorization before processing.
 *
 * Updated: 2025-11-10 - Migrated to use additionalIntegrationData with email support
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'hubspot',
    tokenEndpoint: 'https://api.hubapi.com/oauth/v1/token',
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/hubspot/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(), // Default 6 hours
    }),
    additionalIntegrationData: async (tokenData) => {
      // Fetch HubSpot account information
      // API VERIFICATION: HubSpot API endpoint for account details
      // Docs: https://developers.hubspot.com/docs/api/oauth/tokens
      // Returns: email, user, hub_id, hub_domain, etc.
      // NOTE: HubSpot does NOT provide avatar URLs via their OAuth API
      try {
        const accountResponse = await fetch('https://api.hubapi.com/integrations/v1/me', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        })

        if (!accountResponse.ok) {
          logger.warn('Failed to fetch HubSpot account info:', accountResponse.status)
          return {}
        }

        const accountInfo = await accountResponse.json()

        // Log what we actually received to debug
        logger.debug('✅ HubSpot account info fetched:', {
          email: accountInfo.email,
          user: accountInfo.user,
          hub_domain: accountInfo.hub_domain,
          hub_id: accountInfo.hub_id,
          allFields: Object.keys(accountInfo)
        })

        return {
          email: accountInfo.email || accountInfo.user || null,
          username: accountInfo.user || accountInfo.email || null,
          account_name: accountInfo.hub_domain || accountInfo.user || accountInfo.email || null,
          provider_user_id: accountInfo.user || accountInfo.user_id || null,
          hub_id: accountInfo.hub_id,
          hub_domain: accountInfo.hub_domain,
          // Note: HubSpot doesn't provide avatar_url in this endpoint
        }
      } catch (error) {
        logger.error('Error fetching HubSpot account info:', error)
        return {}
      }
    }
  })
}
