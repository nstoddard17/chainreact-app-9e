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
      // API VERIFICATION: HubSpot provides multiple endpoints for account details
      // Primary: /oauth/v1/access-tokens/{token} - Most reliable for email
      // Fallback: /integrations/v1/me - Alternative endpoint
      // Docs: https://developers.hubspot.com/docs/api/oauth/tokens
      // NOTE: HubSpot does NOT provide avatar URLs via their OAuth API

      logger.info('🔍 [HubSpot] Starting account info fetch with access token')

      // Strategy 1: Try the OAuth access-tokens endpoint (most reliable)
      try {
        logger.debug('🔍 [HubSpot] Trying primary endpoint: /oauth/v1/access-tokens')
        const tokenInfoResponse = await fetch(
          `https://api.hubapi.com/oauth/v1/access-tokens/${tokenData.access_token}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        )

        if (tokenInfoResponse.ok) {
          const tokenInfo = await tokenInfoResponse.json()
          logger.info('✅ [HubSpot] Primary endpoint success:', {
            hasEmail: !!tokenInfo.user,
            hasHubId: !!tokenInfo.hub_id,
            hasHubDomain: !!tokenInfo.hub_domain,
            allFields: Object.keys(tokenInfo)
          })

          if (tokenInfo.user || tokenInfo.hub_domain) {
            return {
              email: tokenInfo.user || null,
              username: tokenInfo.user || null,
              account_name: tokenInfo.hub_domain || tokenInfo.user || null,
              provider_user_id: tokenInfo.user_id || tokenInfo.user || null,
              hub_id: tokenInfo.hub_id,
              hub_domain: tokenInfo.hub_domain,
              token: tokenInfo.token,
            }
          }

          logger.warn('⚠️ [HubSpot] Primary endpoint returned data but missing critical fields, trying fallback')
        } else {
          const errorText = await tokenInfoResponse.text()
          logger.warn('⚠️ [HubSpot] Primary endpoint failed, trying fallback:', {
            status: tokenInfoResponse.status,
            statusText: tokenInfoResponse.statusText,
            error: errorText
          })
        }
      } catch (error) {
        logger.warn('⚠️ [HubSpot] Primary endpoint error, trying fallback:', error)
      }

      // Strategy 2: Fallback to /integrations/v1/me endpoint
      try {
        logger.debug('🔍 [HubSpot] Trying fallback endpoint: /integrations/v1/me')
        const accountResponse = await fetch('https://api.hubapi.com/integrations/v1/me', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        })

        if (!accountResponse.ok) {
          const errorText = await accountResponse.text()
          logger.error('❌ [HubSpot] Fallback endpoint also failed:', {
            status: accountResponse.status,
            statusText: accountResponse.statusText,
            error: errorText
          })
          return {}
        }

        const accountInfo = await accountResponse.json()
        logger.info('✅ [HubSpot] Fallback endpoint success:', {
          hasEmail: !!accountInfo.email,
          hasUser: !!accountInfo.user,
          hasHubDomain: !!accountInfo.hub_domain,
          hasHubId: !!accountInfo.hub_id,
          allFields: Object.keys(accountInfo)
        })

        return {
          email: accountInfo.email || accountInfo.user || null,
          username: accountInfo.user || accountInfo.email || null,
          account_name: accountInfo.hub_domain || accountInfo.user || accountInfo.email || null,
          provider_user_id: accountInfo.user || accountInfo.user_id || null,
          hub_id: accountInfo.hub_id,
          hub_domain: accountInfo.hub_domain,
        }
      } catch (error) {
        logger.error('❌ [HubSpot] Both endpoints failed to fetch account info:', error)
        return {}
      }
    }
  })
}
