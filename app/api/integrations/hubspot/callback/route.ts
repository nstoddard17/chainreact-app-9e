import type { NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'

/**
 * HubSpot OAuth Callback Handler
 *
 * Handles the OAuth callback from HubSpot.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Note: HubSpot may show additional verification screens during OAuth flow.
 * The centralized handler properly waits for complete authorization before processing.
 *
 * Updated: 2025-11-08 - Migrated to use oauth-callback-handler utility
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
    fetchUserProfile: async (accessToken) => {
      const accountResponse = await fetch('https://api.hubapi.com/integrations/v1/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!accountResponse.ok) {
        throw new Error('Failed to fetch HubSpot account information')
      }

      const accountInfo = await accountResponse.json()
      return {
        email: accountInfo.email || accountInfo.user || null,
        name: accountInfo.hub_domain || accountInfo.user || null,
        userId: accountInfo.user || null,
        metadata: {
          hub_id: accountInfo.hub_id,
          hub_domain: accountInfo.hub_domain,
          account_info: accountInfo
        }
      }
    }
  })
}
