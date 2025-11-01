import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'

/**
 * Google Drive OAuth Callback Handler
 *
 * Handles the OAuth callback from Google for Google Drive integration.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 */
export async function GET(request: NextRequest) {
  return handleOAuthCallback(request, {
    provider: 'google-drive',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/google-drive/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
  })
}
