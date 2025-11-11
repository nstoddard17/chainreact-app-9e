/**
 * OAuth Token Revocation Utility
 *
 * Handles revoking OAuth tokens and permissions for various providers
 * when users disconnect/delete integrations.
 *
 * This ensures that when users delete an integration, we revoke all
 * permissions so they need to re-authorize from scratch if reconnecting.
 *
 * Created: 2025-11-10
 */

import { decrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'

// ================================================================
// TYPES
// ================================================================

export interface RevocationResult {
  success: boolean
  provider: string
  revoked: boolean
  error?: string
}

// ================================================================
// PROVIDER REVOCATION CONFIGS
// ================================================================

/**
 * OAuth revocation endpoints for major providers
 * Docs:
 * - Google: https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
 * - Microsoft: https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow#revoke-a-token
 * - GitHub: https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-authorization
 * - Slack: https://api.slack.com/methods/auth.revoke
 * - Stripe: https://stripe.com/docs/connect/oauth-reference#post-deauthorize
 * - Discord: https://discord.com/developers/docs/topics/oauth2#revoking-access-tokens
 */
const REVOCATION_CONFIGS: Record<string, {
  endpoint: string
  method: 'POST' | 'DELETE'
  auth: 'bearer' | 'basic' | 'body'
  bodyParams?: (token: string, clientId?: string, clientSecret?: string) => Record<string, string>
  headers?: Record<string, string>
}> = {
  // Google (Gmail, Drive, Sheets, Calendar, Analytics, YouTube, etc.)
  gmail: {
    endpoint: 'https://oauth2.googleapis.com/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token) => ({ token }),
  },
  'google-drive': {
    endpoint: 'https://oauth2.googleapis.com/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token) => ({ token }),
  },
  'google-sheets': {
    endpoint: 'https://oauth2.googleapis.com/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token) => ({ token }),
  },
  'google-docs': {
    endpoint: 'https://oauth2.googleapis.com/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token) => ({ token }),
  },
  'google-calendar': {
    endpoint: 'https://oauth2.googleapis.com/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token) => ({ token }),
  },
  'google-analytics': {
    endpoint: 'https://oauth2.googleapis.com/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token) => ({ token }),
  },
  youtube: {
    endpoint: 'https://oauth2.googleapis.com/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token) => ({ token }),
  },
  'youtube-studio': {
    endpoint: 'https://oauth2.googleapis.com/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token) => ({ token }),
  },

  // Microsoft (Outlook, OneDrive, Teams, OneNote)
  'microsoft-outlook': {
    endpoint: 'https://graph.microsoft.com/v1.0/me/revokeSignInSessions',
    method: 'POST',
    auth: 'bearer',
  },
  onedrive: {
    endpoint: 'https://graph.microsoft.com/v1.0/me/revokeSignInSessions',
    method: 'POST',
    auth: 'bearer',
  },
  teams: {
    endpoint: 'https://graph.microsoft.com/v1.0/me/revokeSignInSessions',
    method: 'POST',
    auth: 'bearer',
  },
  'microsoft-onenote': {
    endpoint: 'https://graph.microsoft.com/v1.0/me/revokeSignInSessions',
    method: 'POST',
    auth: 'bearer',
  },
  onenote: {
    endpoint: 'https://graph.microsoft.com/v1.0/me/revokeSignInSessions',
    method: 'POST',
    auth: 'bearer',
  },

  // GitHub
  github: {
    endpoint: 'https://api.github.com/applications/{client_id}/token',
    method: 'DELETE',
    auth: 'basic',
  },

  // Slack
  slack: {
    endpoint: 'https://slack.com/api/auth.revoke',
    method: 'POST',
    auth: 'bearer',
  },

  // Discord
  discord: {
    endpoint: 'https://discord.com/api/oauth2/token/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token, clientId, clientSecret) => ({
      token,
      client_id: clientId || '',
      client_secret: clientSecret || '',
    }),
  },

  // Stripe
  stripe: {
    endpoint: 'https://connect.stripe.com/oauth/deauthorize',
    method: 'POST',
    auth: 'body',
    bodyParams: (token, clientId) => ({
      client_id: clientId || '',
      stripe_user_id: token, // For Stripe, the "token" is actually the connected account ID
    }),
  },

  // Notion
  notion: {
    // Notion doesn't have a revocation endpoint - tokens are revoked via UI
    endpoint: '',
    method: 'POST',
    auth: 'bearer',
  },

  // Dropbox
  dropbox: {
    endpoint: 'https://api.dropboxapi.com/2/auth/token/revoke',
    method: 'POST',
    auth: 'bearer',
  },

  // LinkedIn
  linkedin: {
    endpoint: 'https://www.linkedin.com/oauth/v2/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token, clientId, clientSecret) => ({
      token,
      client_id: clientId || '',
      client_secret: clientSecret || '',
    }),
  },

  // Trello
  trello: {
    endpoint: 'https://api.trello.com/1/tokens/{token}',
    method: 'DELETE',
    auth: 'body',
    bodyParams: (token, clientId) => ({
      key: clientId || '',
      token,
    }),
  },

  // HubSpot
  hubspot: {
    endpoint: 'https://api.hubapi.com/oauth/v1/refresh-tokens/{refresh_token}',
    method: 'DELETE',
    auth: 'bearer',
  },

  // Airtable
  airtable: {
    // Airtable doesn't have a revocation endpoint - tokens are revoked via UI
    endpoint: '',
    method: 'POST',
    auth: 'bearer',
  },

  // Shopify
  shopify: {
    // Shopify revocation is done via uninstall app endpoint (shop-specific)
    endpoint: '',
    method: 'POST',
    auth: 'bearer',
  },

  // Facebook/Instagram
  facebook: {
    endpoint: 'https://graph.facebook.com/v18.0/me/permissions',
    method: 'DELETE',
    auth: 'bearer',
  },
  instagram: {
    endpoint: 'https://graph.facebook.com/v18.0/me/permissions',
    method: 'DELETE',
    auth: 'bearer',
  },

  // Twitter/X
  twitter: {
    endpoint: 'https://api.twitter.com/2/oauth2/revoke',
    method: 'POST',
    auth: 'body',
    bodyParams: (token, clientId) => ({
      token,
      client_id: clientId || '',
      token_type_hint: 'access_token',
    }),
  },
}

// ================================================================
// MAIN REVOCATION FUNCTION
// ================================================================

/**
 * Revoke OAuth tokens for a provider
 *
 * @param provider - Provider identifier (e.g., 'gmail', 'slack')
 * @param encryptedAccessToken - Encrypted access token from database
 * @param encryptedRefreshToken - Optional encrypted refresh token
 * @returns RevocationResult with success status
 */
export async function revokeOAuthToken(
  provider: string,
  encryptedAccessToken: string,
  encryptedRefreshToken?: string | null
): Promise<RevocationResult> {
  const config = REVOCATION_CONFIGS[provider]

  // If provider doesn't support revocation, return success anyway
  // (Manual revocation required via provider's UI)
  if (!config || !config.endpoint) {
    logger.info(`${provider} does not support automatic token revocation - manual revocation required`)
    return {
      success: true,
      provider,
      revoked: false,
      error: 'Provider does not support automatic revocation',
    }
  }

  try {
    // Decrypt the access token
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      throw new Error('Encryption key not configured')
    }

    const accessToken = decrypt(encryptedAccessToken, encryptionKey)
    const refreshToken = encryptedRefreshToken
      ? decrypt(encryptedRefreshToken, encryptionKey)
      : undefined

    // Get provider-specific client credentials
    const { clientId, clientSecret } = getProviderCredentials(provider)

    // Build the request
    let endpoint = config.endpoint
    let headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...config.headers,
    }
    let body: string | undefined

    // Handle authentication method
    if (config.auth === 'bearer') {
      headers['Authorization'] = `Bearer ${accessToken}`
    } else if (config.auth === 'basic' && clientId && clientSecret) {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      headers['Authorization'] = `Basic ${credentials}`

      // For GitHub, we need to send the access token in the body
      if (provider === 'github') {
        body = JSON.stringify({ access_token: accessToken })
        headers['Content-Type'] = 'application/json'
      }
    } else if (config.auth === 'body' && config.bodyParams) {
      const params = config.bodyParams(accessToken, clientId, clientSecret)
      body = new URLSearchParams(params).toString()
    }

    // Replace template variables in endpoint
    endpoint = endpoint
      .replace('{client_id}', clientId || '')
      .replace('{token}', accessToken)
      .replace('{refresh_token}', refreshToken || '')

    // Make the revocation request
    logger.debug(`Revoking ${provider} OAuth token...`, {
      endpoint,
      method: config.method,
      auth: config.auth,
    })

    const response = await fetch(endpoint, {
      method: config.method,
      headers,
      body,
    })

    // Most providers return 200 on success
    // Some return 204 (No Content)
    // GitHub returns 204
    // Google returns 200 with empty body
    if (response.ok || response.status === 204) {
      logger.info(`✅ Successfully revoked ${provider} OAuth token`)
      return {
        success: true,
        provider,
        revoked: true,
      }
    }

    // Handle errors
    const errorText = await response.text()
    logger.warn(`Failed to revoke ${provider} token:`, {
      status: response.status,
      error: errorText,
    })

    return {
      success: false,
      provider,
      revoked: false,
      error: `HTTP ${response.status}: ${errorText}`,
    }
  } catch (error: any) {
    logger.error(`Error revoking ${provider} OAuth token:`, error)
    return {
      success: false,
      provider,
      revoked: false,
      error: error.message,
    }
  }
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

/**
 * Get OAuth client credentials for a provider
 */
function getProviderCredentials(provider: string): {
  clientId?: string
  clientSecret?: string
} {
  // Map provider to environment variable prefixes
  const envMap: Record<string, string> = {
    // Google services
    gmail: 'GOOGLE',
    'google-drive': 'GOOGLE',
    'google-sheets': 'GOOGLE',
    'google-docs': 'GOOGLE',
    'google-calendar': 'GOOGLE',
    'google-analytics': 'GOOGLE',
    youtube: 'GOOGLE',
    'youtube-studio': 'GOOGLE',

    // Microsoft services
    'microsoft-outlook': 'MICROSOFT',
    onedrive: 'MICROSOFT',
    teams: 'MICROSOFT',
    'microsoft-onenote': 'MICROSOFT',
    onenote: 'MICROSOFT',

    // Standalone services
    github: 'GITHUB',
    slack: 'SLACK',
    discord: 'DISCORD',
    stripe: 'STRIPE',
    notion: 'NOTION',
    dropbox: 'DROPBOX',
    linkedin: 'LINKEDIN',
    trello: 'TRELLO',
    hubspot: 'HUBSPOT',
    airtable: 'AIRTABLE',
    shopify: 'SHOPIFY',
    facebook: 'FACEBOOK',
    instagram: 'FACEBOOK', // Instagram uses Facebook credentials
    twitter: 'TWITTER',
  }

  const prefix = envMap[provider]
  if (!prefix) {
    return {}
  }

  return {
    clientId: process.env[`${prefix}_CLIENT_ID`],
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`],
  }
}

/**
 * Revoke OAuth token in the background (fire and forget)
 * Use this for async revocation that doesn't block deletion
 */
export function revokeOAuthTokenAsync(
  provider: string,
  encryptedAccessToken: string,
  encryptedRefreshToken?: string | null
): void {
  revokeOAuthToken(provider, encryptedAccessToken, encryptedRefreshToken)
    .then((result) => {
      if (result.success && result.revoked) {
        logger.info(`✅ Background revocation successful for ${provider}`)
      } else if (!result.revoked) {
        logger.info(`ℹ️ ${provider} requires manual revocation - ${result.error}`)
      } else {
        logger.warn(`⚠️ Background revocation failed for ${provider}: ${result.error}`)
      }
    })
    .catch((error) => {
      logger.error(`❌ Background revocation error for ${provider}:`, error)
    })
}
