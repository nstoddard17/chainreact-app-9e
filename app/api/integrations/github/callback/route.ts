import type { NextRequest } from "next/server"
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'

/**
 * GitHub OAuth Callback Handler
 *
 * Handles the OAuth callback from GitHub.
 * Uses centralized OAuth handler with workspace context support.
 *
 * Note: GitHub uses JSON format instead of form-urlencoded for token exchange.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
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
  })
}
