import { type NextRequest } from 'next/server'
import { handleOAuthCallback } from '@/lib/integrations/oauth-callback-handler'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

/**
 * Slack OAuth Callback Handler
 *
 * Handles the OAuth callback from Slack.
 * Slack uses OAuth v2 and returns both bot and user tokens.
 *
 * Updated: 2025-10-28 - Migrated to use oauth-callback-handler utility
 */
export async function GET(request: NextRequest) {
  const baseUrl = getBaseUrl()
  const devWebhookUrl =
    process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL ||
    process.env.NGROK_URL ||
    process.env.NEXT_PUBLIC_NGROK_URL ||
    process.env.TUNNEL_URL
  const redirectBase = devWebhookUrl || baseUrl

  logger.debug('📍 Slack callback - Base URL:', baseUrl)
  logger.debug('📍 Slack callback - Using redirect base:', redirectBase)

  return handleOAuthCallback(request, {
    provider: 'slack',
    tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
    clientId: process.env.SLACK_CLIENT_ID!,
    clientSecret: process.env.SLACK_CLIENT_SECRET!,
    getRedirectUri: () => `${redirectBase}/api/integrations/slack/callback`,
    transformTokenData: (tokenData) => {
      // Slack returns both bot token (xoxb-) and user token (xoxp-)
      const botToken = tokenData.access_token
      const userToken = tokenData.authed_user?.access_token
      const botRefreshToken = tokenData.refresh_token
      const userRefreshToken = tokenData.authed_user?.refresh_token

      // Use bot token as primary (for backward compatibility)
      const accessToken = botToken || userToken
      const refreshToken = botRefreshToken || userRefreshToken

      // Combine both bot and user scopes
      const botScopes = tokenData.scope ? tokenData.scope.split(' ') : []
      const userScopes = tokenData.authed_user?.scope ? tokenData.authed_user.scope.split(' ') : []
      const scopes = [...new Set([...botScopes, ...userScopes])]

      const expiresIn = tokenData.authed_user?.expires_in || tokenData.expires_in

      logger.debug('Slack token response structure:', {
        ok: tokenData.ok,
        app_id: tokenData.app_id,
        authed_user: tokenData.authed_user ? { id: tokenData.authed_user.id } : null,
        team: tokenData.team,
        has_bot_token: !!botToken,
        has_user_token: !!userToken,
        has_refresh_token: !!refreshToken,
        bot_scope: tokenData.scope,
        user_scope: tokenData.authed_user?.scope,
        token_type: tokenData.token_type,
      })

      return {
        access_token: accessToken,
        refresh_token: refreshToken || null,
        scopes,
        expires_at: expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null,
      }
    },
    additionalIntegrationData: (tokenData, state) => {
      const botToken = tokenData.access_token
      const userToken = tokenData.authed_user?.access_token
      const userRefreshToken = tokenData.authed_user?.refresh_token

      // Encrypt user token separately for storage in metadata
      const encryptionKey = process.env.ENCRYPTION_KEY!
      let encryptedUserToken = null
      let encryptedUserRefreshToken = null

      if (userToken) {
        encryptedUserToken = encrypt(userToken, encryptionKey)
        encryptedUserRefreshToken = userRefreshToken
          ? encrypt(userRefreshToken, encryptionKey)
          : null
      }

      return {
        token_type: botToken ? 'bot' : 'user',
        team_id: tokenData.team?.id,
        team_name: tokenData.team?.name,
        app_id: tokenData.app_id,
        authed_user_id: tokenData.authed_user?.id,
        // Store encrypted user tokens for "send as user" functionality
        user_token: encryptedUserToken,
        user_refresh_token: encryptedUserRefreshToken,
        has_user_token: !!userToken,
        bot_scopes: tokenData.scope,
        user_scopes: tokenData.authed_user?.scope,
      }
    },
  })
}
