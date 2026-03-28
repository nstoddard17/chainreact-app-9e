/**
 * Unified Provider Registry
 *
 * Single source of truth for all provider configurations.
 * Maps provider names to their callback configs (and eventually data configs).
 *
 * Created: 2026-03-28
 */

import { type NextRequest } from 'next/server'
import { type OAuthCallbackConfig, type OAuthState } from './oauth-callback-handler'
import { encrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { jsonResponse } from '@/lib/utils/api-response'

// ================================================================
// TYPES
// ================================================================

export interface CallbackRegistryEntry {
  /** Builds the OAuthCallbackConfig for handleOAuthCallback */
  config: (baseUrl: string) => OAuthCallbackConfig
  /** Pre-handler hook: runs before handleOAuthCallback. Return Response to short-circuit. */
  preHandler?: (request: NextRequest) => Promise<Response | null>
}

export interface ProviderDefinition {
  name: string
  callback: CallbackRegistryEntry
  // Data config will be added in Phase 2
}

// ================================================================
// PROVIDER REGISTRY
// ================================================================

export const PROVIDER_REGISTRY: Record<string, ProviderDefinition> = {}

/** Typed union of all registered provider names */
export type ProviderName = keyof typeof PROVIDER_REGISTRY

/** Type guard: is this string a known provider? */
export function isKnownProvider(name: string): name is ProviderName {
  return name in PROVIDER_REGISTRY
}

/** Fail-fast accessor — throws if provider is missing */
export function getProviderDefinition(name: string): ProviderDefinition {
  const def = PROVIDER_REGISTRY[name]
  if (!def) {
    throw new Error(`[ProviderRegistry] No definition for provider "${name}". Did you forget to register it?`)
  }
  return def
}

// ================================================================
// SHARED HELPERS
// ================================================================

/** Standard Google OAuth token transform (used by 7+ Google providers) */
function googleTransformTokenData(tokenData: any) {
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
    expires_at: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null,
  }
}

/** Standard Google userinfo fetch (used by 7+ Google providers) */
async function googleAdditionalData(tokenData: any) {
  try {
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (userinfoResponse.ok) {
      const userinfo = await userinfoResponse.json()
      return {
        email: userinfo.email,
        account_name: userinfo.name || userinfo.email,
        provider_user_id: userinfo.id,
        avatar_url: userinfo.picture || null,
        google_id: userinfo.id,
        picture: userinfo.picture,
      }
    }
    logger.warn('[ProviderRegistry] Failed to fetch Google userinfo:', userinfoResponse.status)
    return {}
  } catch (error) {
    logger.error('[ProviderRegistry] Error fetching Google userinfo:', error)
    return {}
  }
}

/** Standard Microsoft token transform (used by 5+ Microsoft providers) */
function microsoftTransformTokenData(tokenData: any) {
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
    expires_at: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null,
  }
}

/** Standard Microsoft Graph user info fetch (used by 5+ Microsoft providers) */
async function microsoftAdditionalData(tokenData: any) {
  try {
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!userResponse.ok) {
      logger.warn('[ProviderRegistry] Failed to fetch Microsoft user info:', userResponse.status)
      return {}
    }
    const userData = await userResponse.json()

    // Try to get profile photo
    let avatarUrl: string | null = null
    try {
      const photoResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      if (photoResponse.ok) {
        const photoBlob = await photoResponse.arrayBuffer()
        const base64 = Buffer.from(photoBlob).toString('base64')
        avatarUrl = `data:image/jpeg;base64,${base64}`
      }
    } catch {
      // Photo not available, that's fine
    }

    return {
      email: userData.mail || userData.userPrincipalName,
      username: userData.displayName,
      account_name: userData.displayName || userData.mail || userData.userPrincipalName,
      provider_user_id: userData.id,
      avatar_url: avatarUrl,
    }
  } catch (error) {
    logger.error('[ProviderRegistry] Error fetching Microsoft user info:', error)
    return {}
  }
}

/** Standard space-separated scope + expires_in transform */
function standardTransformTokenData(tokenData: any) {
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || null,
    scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
    expires_at: tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null,
  }
}

// ================================================================
// REGISTER ALL PROVIDERS
// ================================================================

function register(name: string, callback: CallbackRegistryEntry) {
  PROVIDER_REGISTRY[name] = { name, callback }
}

// ----------------------------------------------------------------
// GOOGLE FAMILY (all use same token endpoint + Google userinfo)
// ----------------------------------------------------------------

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

for (const provider of [
  'gmail', 'google-drive', 'google-sheets', 'google-calendar',
  'google-analytics', 'google-docs', 'youtube', 'youtube-studio',
]) {
  register(provider, {
    config: (baseUrl) => ({
      provider,
      tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      getRedirectUri: (base) => `${base}/api/integrations/${provider}/callback`,
      transformTokenData: googleTransformTokenData,
      additionalIntegrationData: googleAdditionalData,
    }),
  })
}

// ----------------------------------------------------------------
// MICROSOFT FAMILY (all use same token endpoint + MS Graph)
// ----------------------------------------------------------------

const MS_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token'

register('teams', {
  config: (baseUrl) => ({
    provider: 'teams',
    tokenEndpoint: MS_TOKEN_ENDPOINT,
    clientId: process.env.TEAMS_CLIENT_ID!,
    clientSecret: process.env.TEAMS_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/teams/callback`,
    transformTokenData: (tokenData) => {
      const result = microsoftTransformTokenData(tokenData)
      return result
    },
    additionalIntegrationData: async (tokenData, state) => {
      const baseData = await microsoftAdditionalData(tokenData)
      // Teams validates work/school account via internal API
      try {
        const validateResponse = await fetch(`${getBaseUrl()}/api/integrations/validate-teams-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: tokenData.access_token }),
        })
        if (validateResponse.ok) {
          const validation = await validateResponse.json()
          if (!validation.isValid) {
            logger.warn('[ProviderRegistry] Teams personal account detected')
          }
        }
      } catch {
        // Validation endpoint may not exist, proceed anyway
      }
      return {
        ...baseData,
        refresh_token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }
    },
  }),
})

register('microsoft-outlook', {
  config: (baseUrl) => ({
    provider: 'microsoft-outlook',
    tokenEndpoint: MS_TOKEN_ENDPOINT,
    clientId: process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/microsoft-outlook/callback`,
    transformTokenData: microsoftTransformTokenData,
    additionalIntegrationData: async (tokenData) => {
      const baseData = await microsoftAdditionalData(tokenData)
      return {
        ...baseData,
        refresh_token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }
    },
  }),
})

register('onedrive', {
  config: (baseUrl) => ({
    provider: 'onedrive',
    tokenEndpoint: MS_TOKEN_ENDPOINT,
    clientId: process.env.ONEDRIVE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.ONEDRIVE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/onedrive/callback`,
    transformTokenData: microsoftTransformTokenData,
    additionalIntegrationData: microsoftAdditionalData,
  }),
})

register('microsoft-excel', {
  config: (baseUrl) => ({
    provider: 'microsoft-excel',
    tokenEndpoint: MS_TOKEN_ENDPOINT,
    clientId: process.env.EXCEL_CLIENT_ID || process.env.ONEDRIVE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.EXCEL_CLIENT_SECRET || process.env.ONEDRIVE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/excel/callback`,
    transformTokenData: microsoftTransformTokenData,
    additionalIntegrationData: microsoftAdditionalData,
  }),
})

register('microsoft-onenote', {
  config: (baseUrl) => ({
    provider: 'microsoft-onenote',
    tokenEndpoint: MS_TOKEN_ENDPOINT,
    clientId: process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/microsoft-onenote/callback`,
    transformTokenData: microsoftTransformTokenData,
    additionalIntegrationData: microsoftAdditionalData,
  }),
})

// OneNote has a second route path — register under same provider name
register('onenote', {
  config: (baseUrl) => ({
    provider: 'microsoft-onenote',
    tokenEndpoint: MS_TOKEN_ENDPOINT,
    clientId: process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID!,
    clientSecret: process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/onenote/callback`,
    transformTokenData: microsoftTransformTokenData,
    additionalIntegrationData: microsoftAdditionalData,
  }),
})

// ----------------------------------------------------------------
// SLACK (bot + user tokens, dev webhook URL override)
// ----------------------------------------------------------------

register('slack', {
  config: (baseUrl) => {
    const devWebhookUrl =
      process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL ||
      process.env.NGROK_URL ||
      process.env.NEXT_PUBLIC_NGROK_URL ||
      process.env.TUNNEL_URL
    const redirectBase = devWebhookUrl || baseUrl

    return {
      provider: 'slack',
      tokenEndpoint: 'https://slack.com/api/oauth.v2.access',
      clientId: process.env.SLACK_CLIENT_ID!,
      clientSecret: process.env.SLACK_CLIENT_SECRET!,
      getRedirectUri: () => `${redirectBase}/api/integrations/slack/callback`,
      transformTokenData: (tokenData) => {
        const botToken = tokenData.access_token
        const userToken = tokenData.authed_user?.access_token
        const botRefreshToken = tokenData.refresh_token
        const userRefreshToken = tokenData.authed_user?.refresh_token
        const accessToken = botToken || userToken
        const refreshToken = botRefreshToken || userRefreshToken
        const botScopes = tokenData.scope ? tokenData.scope.split(' ') : []
        const userScopes = tokenData.authed_user?.scope ? tokenData.authed_user.scope.split(' ') : []
        const scopes = [...new Set([...botScopes, ...userScopes])]
        const expiresIn = tokenData.authed_user?.expires_in || tokenData.expires_in

        return {
          access_token: accessToken,
          refresh_token: refreshToken || null,
          scopes,
          expires_at: expiresIn
            ? new Date(Date.now() + expiresIn * 1000).toISOString()
            : null,
        }
      },
      additionalIntegrationData: async (tokenData) => {
        const botToken = tokenData.access_token
        const userToken = tokenData.authed_user?.access_token
        const userRefreshToken = tokenData.authed_user?.refresh_token

        const encryptionKey = process.env.ENCRYPTION_KEY!
        let encryptedUserToken = null
        let encryptedUserRefreshToken = null

        if (userToken) {
          encryptedUserToken = encrypt(userToken, encryptionKey)
          encryptedUserRefreshToken = userRefreshToken
            ? encrypt(userRefreshToken, encryptionKey)
            : null
        }

        let userEmail = null
        let userName = null
        let avatarUrl = null

        try {
          const identityResponse = await fetch('https://slack.com/api/users.identity', {
            headers: { Authorization: `Bearer ${userToken || botToken}` },
          })
          if (identityResponse.ok) {
            const identity = await identityResponse.json()
            if (identity.ok) {
              userEmail = identity.user?.email
              userName = identity.user?.name
              avatarUrl = identity.user?.image_512 || identity.user?.image_192 || identity.user?.image_72 || null
            }
          }
        } catch (error) {
          logger.error('[ProviderRegistry] Error fetching Slack user identity:', error)
        }

        return {
          email: userEmail,
          username: userName,
          account_name: userName || userEmail || tokenData.team?.name,
          avatar_url: avatarUrl,
          token_type: botToken ? 'bot' : 'user',
          team_id: tokenData.team?.id,
          team_name: tokenData.team?.name,
          app_id: tokenData.app_id,
          authed_user_id: tokenData.authed_user?.id,
          user_token: encryptedUserToken,
          user_refresh_token: encryptedUserRefreshToken,
          has_user_token: !!userToken,
          bot_scopes: tokenData.scope,
          user_scopes: tokenData.authed_user?.scope,
        }
      },
    }
  },
})

// ----------------------------------------------------------------
// DISCORD (pre-handler for bot OAuth flow)
// ----------------------------------------------------------------

register('discord', {
  preHandler: async (request: NextRequest) => {
    const { searchParams } = new URL(request.url)
    const guildId = searchParams.get('guild_id')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')
    const code = searchParams.get('code')
    const baseUrl = getBaseUrl()

    if (error) {
      return createPopupResponse('error', 'discord', errorDescription || 'An unknown error occurred.', baseUrl)
    }
    if (!code) {
      return createPopupResponse('error', 'discord', 'Authorization code is missing.', baseUrl)
    }
    // Bot OAuth flow — guild_id means bot was added to a server, not a user integration
    if (guildId) {
      return createPopupResponse('success', 'Discord Bot',
        `The bot has been successfully added to your Discord server (ID: ${guildId}).`, baseUrl)
    }
    return null // Continue to normal OAuth flow
  },
  config: (baseUrl) => ({
    provider: 'discord',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    clientId: process.env.DISCORD_CLIENT_ID!,
    clientSecret: process.env.DISCORD_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/discord/callback`,
    transformTokenData: (tokenData) => {
      const scopes = tokenData.scope ? tokenData.scope.split(' ') : []
      if (scopes.includes('bot')) {
        throw new Error('Bot OAuth should be handled separately')
      }
      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || null,
        scopes,
        expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
      }
    },
    additionalIntegrationData: async (tokenData) => {
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      if (!userResponse.ok) return {}

      const userData = await userResponse.json()
      const username = userData.discriminator && userData.discriminator !== '0'
        ? `${userData.username}#${userData.discriminator}`
        : userData.username

      let avatarUrl: string | null = null
      if (userData.avatar && userData.id) {
        const extension = userData.avatar.startsWith('a_') ? 'gif' : 'png'
        avatarUrl = `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.${extension}?size=256`
      }

      return {
        email: userData.email,
        username,
        account_name: userData.global_name || username || userData.email,
        provider_user_id: userData.id,
        avatar_url: avatarUrl,
        discord_username: userData.username,
        discord_discriminator: userData.discriminator,
        avatar: userData.avatar,
      }
    },
  }),
})

// ----------------------------------------------------------------
// GITHUB (comma-separated scopes, JSON response, email fetch)
// ----------------------------------------------------------------

register('github', {
  config: (baseUrl) => ({
    provider: 'github',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/github/callback`,
    useJsonResponse: true,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(',') : [],
      expires_at: null,
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        })
        if (!userResponse.ok) return {}

        const userData = await userResponse.json()

        // GitHub may hide email — fetch from /user/emails if needed
        let email = userData.email
        if (!email) {
          try {
            const emailsResponse = await fetch('https://api.github.com/user/emails', {
              headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
                Accept: 'application/vnd.github.v3+json',
              },
            })
            if (emailsResponse.ok) {
              const emails = await emailsResponse.json()
              const primary = emails.find((e: any) => e.primary) || emails[0]
              email = primary?.email || null
            }
          } catch {
            // Email fetch failed, continue without
          }
        }

        return {
          email,
          username: userData.login,
          account_name: userData.name || userData.login,
          provider_user_id: userData.id,
          avatar_url: userData.avatar_url || null,
          github_login: userData.login,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching GitHub user info:', error)
        return {}
      }
    },
  }),
})

// ----------------------------------------------------------------
// HUBSPOT (dual-endpoint user info strategy)
// ----------------------------------------------------------------

register('hubspot', {
  config: (baseUrl) => ({
    provider: 'hubspot',
    tokenEndpoint: 'https://api.hubapi.com/oauth/v1/token',
    clientId: process.env.HUBSPOT_CLIENT_ID!,
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/hubspot/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    }),
    additionalIntegrationData: async (tokenData) => {
      // Primary: access-tokens endpoint
      try {
        const tokenInfoResponse = await fetch(
          `https://api.hubapi.com/oauth/v1/access-tokens/${tokenData.access_token}`
        )
        if (tokenInfoResponse.ok) {
          const tokenInfo = await tokenInfoResponse.json()
          return {
            email: tokenInfo.user,
            username: tokenInfo.user,
            account_name: tokenInfo.hub_domain || tokenInfo.user,
            provider_user_id: tokenInfo.user_id,
            hub_id: tokenInfo.hub_id,
            hub_domain: tokenInfo.hub_domain,
          }
        }
      } catch {
        // Fall through to backup
      }

      // Fallback: integrations/me endpoint
      try {
        const meResponse = await fetch('https://api.hubapi.com/integrations/v1/me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (meResponse.ok) {
          const meData = await meResponse.json()
          return {
            email: meData.user,
            account_name: meData.hubDomain || meData.user,
            provider_user_id: meData.userId,
            hub_id: meData.portalId,
          }
        }
      } catch {
        // Both failed
      }
      return {}
    },
  }),
})

// ----------------------------------------------------------------
// STRIPE (no client_id, empty redirect)
// ----------------------------------------------------------------

register('stripe', {
  config: (baseUrl) => ({
    provider: 'stripe',
    tokenEndpoint: 'https://connect.stripe.com/oauth/token',
    clientId: '',
    clientSecret: process.env.STRIPE_CLIENT_SECRET!,
    getRedirectUri: () => '',
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: null,
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        const accountResponse = await fetch('https://api.stripe.com/v1/account', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!accountResponse.ok) return { stripe_user_id: tokenData.stripe_user_id }

        const account = await accountResponse.json()
        return {
          email: account.email,
          username: account.business_profile?.name || account.email,
          account_name: account.business_profile?.name || account.email,
          provider_user_id: account.id,
          stripe_publishable_key: tokenData.stripe_publishable_key,
          stripe_user_id: tokenData.stripe_user_id || account.id,
          livemode: tokenData.livemode,
          country: account.country,
          business_type: account.business_type,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Stripe account info:', error)
        return { stripe_user_id: tokenData.stripe_user_id }
      }
    },
  }),
})

// ----------------------------------------------------------------
// MAILCHIMP (metadata + account info fetch, hardcoded scopes)
// ----------------------------------------------------------------

register('mailchimp', {
  config: (baseUrl) => ({
    provider: 'mailchimp',
    tokenEndpoint: 'https://login.mailchimp.com/oauth2/token',
    clientId: process.env.MAILCHIMP_CLIENT_ID!,
    clientSecret: process.env.MAILCHIMP_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/mailchimp/callback`,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: null,
      scopes: ['campaigns', 'audience', 'automation', 'root'],
      expires_at: null,
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        // Get metadata (dc/server prefix)
        const metadataResponse = await fetch('https://login.mailchimp.com/oauth2/metadata', {
          headers: { Authorization: `OAuth ${tokenData.access_token}` },
        })
        if (!metadataResponse.ok) return {}

        const metadata = await metadataResponse.json()
        const dc = metadata.dc

        // Get account details
        const accountResponse = await fetch(`https://${dc}.api.mailchimp.com/3.0/`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!accountResponse.ok) return { metadata }

        const account = await accountResponse.json()
        return {
          email: account.email || metadata.login?.email,
          username: account.username || account.account_name,
          account_name: account.account_name || account.username,
          metadata: { dc, accountname: account.account_name, login_url: metadata.login_url, api_endpoint: metadata.api_endpoint },
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Mailchimp account info:', error)
        return {}
      }
    },
  }),
})

// ----------------------------------------------------------------
// BOX
// ----------------------------------------------------------------

register('box', {
  config: (baseUrl) => ({
    provider: 'box',
    tokenEndpoint: 'https://api.box.com/oauth2/token',
    clientId: process.env.BOX_CLIENT_ID!,
    clientSecret: process.env.BOX_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/box/callback`,
    transformTokenData: standardTransformTokenData,
    additionalIntegrationData: async (tokenData) => {
      try {
        const userResponse = await fetch('https://api.box.com/2.0/users/me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!userResponse.ok) return {}

        const userData = await userResponse.json()
        return {
          email: userData.login,
          username: userData.name,
          account_name: userData.name || userData.login,
          provider_user_id: userData.id,
          avatar_url: userData.avatar_url || null,
          box_user_id: userData.id,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Box user info:', error)
        return {}
      }
    },
  }),
})

// ----------------------------------------------------------------
// MONDAY.COM (GraphQL user fetch)
// ----------------------------------------------------------------

register('monday', {
  config: (baseUrl) => ({
    provider: 'monday',
    tokenEndpoint: 'https://auth.monday.com/oauth2/token',
    clientId: process.env.MONDAY_CLIENT_ID!,
    clientSecret: process.env.MONDAY_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/monday/callback`,
    transformTokenData: standardTransformTokenData,
    additionalIntegrationData: async (tokenData) => {
      try {
        const userResponse = await fetch('https://api.monday.com/v2', {
          method: 'POST',
          headers: {
            Authorization: tokenData.access_token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: '{ me { id name email } }' }),
        })
        if (!userResponse.ok) return {}

        const userData = await userResponse.json()
        const me = userData.data?.me
        if (!me) return {}

        return {
          email: me.email,
          username: me.name,
          account_name: me.name || me.email,
          provider_user_id: me.id,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Monday.com user info:', error)
        return {}
      }
    },
  }),
})

// ----------------------------------------------------------------
// PKCE PROVIDERS — Batch A (simple PKCE + standard exchange)
// ----------------------------------------------------------------

register('kit', {
  config: (baseUrl) => ({
    provider: 'kit',
    tokenEndpoint: 'https://app.kit.com/oauth/token',
    clientId: process.env.KIT_CLIENT_ID!,
    clientSecret: process.env.KIT_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/kit/callback`,
    requiresPkce: true,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : new Date(Date.now() + 2592000 * 1000).toISOString(), // 30 days default
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        const accountResponse = await fetch('https://api.kit.com/v4/account', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!accountResponse.ok) return {}
        const account = await accountResponse.json()
        return {
          email: account.primary_email_address || account.email,
          username: account.name,
          account_name: account.name || account.primary_email_address || account.email,
          provider_user_id: account.id,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Kit account info:', error)
        return {}
      }
    },
  }),
})

register('linkedin', {
  config: (baseUrl) => ({
    provider: 'linkedin',
    tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
    clientId: process.env.LINKEDIN_CLIENT_ID!,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/linkedin/callback`,
    requiresPkce: true,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : new Date(Date.now() + 5184000 * 1000).toISOString(), // 60 days default
    }),
    additionalIntegrationData: async (tokenData) => {
      const headers = { Authorization: `Bearer ${tokenData.access_token}` }
      let email: string | null = null
      let firstName = ''
      let lastName = ''
      let avatarUrl: string | null = null

      // 1. Profile info
      try {
        const profileResponse = await fetch('https://api.linkedin.com/v2/me', { headers })
        if (profileResponse.ok) {
          const profile = await profileResponse.json()
          firstName = profile.localizedFirstName || ''
          lastName = profile.localizedLastName || ''
        }
      } catch { /* continue */ }

      // 2. Profile picture
      try {
        const pictureResponse = await fetch(
          'https://api.linkedin.com/v2/me?projection=(profilePicture(displayImage~:playableStreams))',
          { headers }
        )
        if (pictureResponse.ok) {
          const pictureData = await pictureResponse.json()
          const elements = pictureData.profilePicture?.['displayImage~']?.elements || []
          // Get highest resolution
          const sorted = elements.sort((a: any, b: any) =>
            (b.data?.['com.linkedin.digitalmedia.mediaartifact.StillImage']?.displaySize?.width || 0) -
            (a.data?.['com.linkedin.digitalmedia.mediaartifact.StillImage']?.displaySize?.width || 0)
          )
          avatarUrl = sorted[0]?.identifiers?.[0]?.identifier || null
        }
      } catch { /* continue */ }

      // 3. Email
      try {
        const emailResponse = await fetch(
          'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
          { headers }
        )
        if (emailResponse.ok) {
          const emailData = await emailResponse.json()
          email = emailData.elements?.[0]?.['handle~']?.emailAddress || null
        }
      } catch { /* continue */ }

      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      return {
        email,
        username: fullName,
        account_name: fullName || email,
        avatar_url: avatarUrl,
      }
    },
  }),
})

register('dropbox', {
  config: (baseUrl) => ({
    provider: 'dropbox',
    tokenEndpoint: 'https://api.dropboxapi.com/oauth2/token',
    clientId: process.env.DROPBOX_CLIENT_ID!,
    clientSecret: process.env.DROPBOX_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/dropbox/callback`,
    requiresPkce: true,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : new Date(Date.now() + 14400 * 1000).toISOString(), // 4 hours default
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        const accountResponse = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!accountResponse.ok) return {}
        const account = await accountResponse.json()
        return {
          email: account.email,
          username: account.name?.display_name || account.name?.given_name,
          account_name: account.name?.display_name || account.email,
          provider_user_id: account.account_id,
          avatar_url: account.profile_photo_url || null,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Dropbox account info:', error)
        return {}
      }
    },
    onSuccess: async () => {
      // Clear workflow flags after successful connection
      try {
        const { clearIntegrationWorkflowFlags } = await import('@/lib/integrations/integrationWorkflowManager')
        await clearIntegrationWorkflowFlags()
      } catch { /* non-fatal */ }
    },
  }),
})

register('gumroad', {
  config: (baseUrl) => ({
    provider: 'gumroad',
    tokenEndpoint: 'https://api.gumroad.com/oauth/token',
    clientId: process.env.GUMROAD_CLIENT_ID!,
    clientSecret: process.env.GUMROAD_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/gumroad/callback`,
    requiresPkce: true,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      // Gumroad doesn't provide refresh tokens — set 1-year nominal expiration
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        // Gumroad uses access_token as query param, not Bearer header
        const userResponse = await fetch(`https://api.gumroad.com/v2/user?access_token=${tokenData.access_token}`)
        if (!userResponse.ok) return {}
        const data = await userResponse.json()
        const user = data.user
        if (!user) return {}
        return {
          email: user.email,
          username: user.name,
          account_name: user.name || user.email,
          provider_user_id: user.user_id,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Gumroad user info:', error)
        return {}
      }
    },
  }),
})

register('blackbaud', {
  config: (baseUrl) => ({
    provider: 'blackbaud',
    tokenEndpoint: 'https://oauth2.sky.blackbaud.com/token',
    clientId: process.env.BLACKBAUD_CLIENT_ID!,
    clientSecret: process.env.BLACKBAUD_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/blackbaud/callback`,
    requiresPkce: true,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days default
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        // Blackbaud requires a subscription key from integration_configs
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const supabase = createAdminClient()
        const { data: configData } = await supabase
          .from('integration_configs')
          .select('config')
          .eq('provider', 'blackbaud')
          .single()
        const subscriptionKey = configData?.config?.subscription_key || process.env.BLACKBAUD_SUBSCRIPTION_KEY

        const headers: Record<string, string> = {
          Authorization: `Bearer ${tokenData.access_token}`,
        }
        if (subscriptionKey) {
          headers['bb-api-subscription-key'] = subscriptionKey
        }

        const userResponse = await fetch('https://api.sky.blackbaud.com/platform/v1/users/v1/me', { headers })
        if (!userResponse.ok) return { subscription_key: subscriptionKey }

        const userData = await userResponse.json()
        return {
          email: userData.email,
          username: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : userData.email,
          account_name: userData.environment_name || userData.email,
          provider_user_id: userData.id,
          subscription_key: subscriptionKey,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Blackbaud user info:', error)
        return {}
      }
    },
  }),
})

// ----------------------------------------------------------------
// PKCE + BASIC AUTH PROVIDERS — Batch B
// ----------------------------------------------------------------

register('twitter', {
  config: (baseUrl) => ({
    provider: 'twitter',
    tokenEndpoint: 'https://api.twitter.com/2/oauth2/token',
    clientId: process.env.TWITTER_CLIENT_ID!,
    clientSecret: process.env.TWITTER_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/twitter/callback`,
    requiresPkce: true,
    useBasicAuth: true,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        const userResponse = await fetch(
          'https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url',
          { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        )
        if (!userResponse.ok) return {}
        const userData = await userResponse.json()
        const user = userData.data
        if (!user) return {}
        return {
          username: user.username,
          account_name: user.name || user.username,
          provider_user_id: user.id,
          avatar_url: user.profile_image_url || null,
          refresh_token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Twitter user info:', error)
        return {}
      }
    },
  }),
})

register('airtable', {
  config: (baseUrl) => ({
    provider: 'airtable',
    tokenEndpoint: 'https://airtable.com/oauth2/v1/token',
    clientId: process.env.AIRTABLE_CLIENT_ID!,
    clientSecret: process.env.AIRTABLE_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/airtable/callback`,
    requiresPkce: true,
    useBasicAuth: true,
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        const whoamiResponse = await fetch('https://api.airtable.com/v0/meta/whoami', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        })
        if (!whoamiResponse.ok) return {}
        const whoami = await whoamiResponse.json()
        return {
          email: whoami.email,
          username: whoami.email,
          account_name: whoami.email,
          provider_user_id: whoami.id,
          scopes: whoami.scopes || [],
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Airtable user info:', error)
        return {}
      }
    },
    onSuccess: async (integrationId) => {
      // Background: sync bases and register webhooks
      const base = getBaseUrl()
      try {
        fetch(`${base}/api/integrations/airtable/sync-bases`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integrationId }),
        }).catch(() => {})
        fetch(`${base}/api/integrations/airtable/register-webhooks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integrationId }),
        }).catch(() => {})
      } catch { /* non-fatal background tasks */ }
    },
  }),
})

// ----------------------------------------------------------------
// CUSTOM TOKEN EXCHANGE PROVIDERS — Batch B continued
// ----------------------------------------------------------------

register('facebook', {
  config: (baseUrl) => ({
    provider: 'facebook',
    tokenEndpoint: 'https://graph.facebook.com/v19.0/oauth/access_token',
    clientId: process.env.FACEBOOK_CLIENT_ID!,
    clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/facebook/callback`,
    // Facebook uses GET-based token exchange
    customTokenExchange: async ({ code, redirectUri, clientId, clientSecret }) => {
      const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${clientSecret}&code=${code}`
      const response = await fetch(tokenUrl)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error?.message || 'Failed to exchange Facebook token')
      }
      return response.json()
    },
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: null,
      scopes: tokenData.scope ? tokenData.scope.split(',') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    additionalIntegrationData: async (tokenData) => {
      // Fetch granted scopes via debug_token
      let grantedScopes: string[] = []
      try {
        const appToken = `${process.env.FACEBOOK_CLIENT_ID}|${process.env.FACEBOOK_CLIENT_SECRET}`
        const debugResponse = await fetch(
          `https://graph.facebook.com/v19.0/debug_token?input_token=${tokenData.access_token}&access_token=${appToken}`
        )
        if (debugResponse.ok) {
          const debugData = await debugResponse.json()
          grantedScopes = debugData.data?.scopes || []
        }
      } catch { /* continue */ }

      // Fetch user info
      try {
        const userResponse = await fetch(
          `https://graph.facebook.com/v19.0/me?fields=email,name,picture.type(large)&access_token=${tokenData.access_token}`
        )
        if (!userResponse.ok) return { granted_scopes: grantedScopes }
        const userData = await userResponse.json()
        return {
          email: userData.email,
          username: userData.name,
          account_name: userData.name || userData.email,
          provider_user_id: userData.id,
          avatar_url: userData.picture?.data?.url || null,
          granted_scopes: grantedScopes,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Facebook user info:', error)
        return { granted_scopes: grantedScopes }
      }
    },
  }),
})

register('instagram', {
  config: (baseUrl) => ({
    provider: 'instagram',
    tokenEndpoint: 'https://api.instagram.com/oauth/access_token',
    clientId: process.env.INSTAGRAM_CLIENT_ID!,
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/instagram/callback`,
    requiresPkce: true,
    // Instagram uses two-step token exchange: short-lived → long-lived
    customTokenExchange: async ({ code, redirectUri, clientId, clientSecret }) => {
      // Step 1: Exchange code for short-lived token
      const shortResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      })
      if (!shortResponse.ok) {
        const errorData = await shortResponse.json()
        throw new Error(errorData.error_message || 'Failed to exchange Instagram token')
      }
      const shortData = await shortResponse.json()

      // Step 2: Exchange short-lived for long-lived token
      const longUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${shortData.access_token}`
      const longResponse = await fetch(longUrl)
      if (!longResponse.ok) {
        // Fall back to short-lived token
        return shortData
      }
      const longData = await longResponse.json()
      return {
        ...shortData,
        access_token: longData.access_token,
        expires_in: longData.expires_in,
        token_type: longData.token_type,
      }
    },
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: null,
      scopes: tokenData.permissions ? tokenData.permissions : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days default
    }),
    additionalIntegrationData: async (tokenData) => {
      try {
        const userResponse = await fetch(
          `https://graph.instagram.com/me?fields=id,username,account_type,profile_picture_url&access_token=${tokenData.access_token}`
        )
        if (!userResponse.ok) return {}
        const userData = await userResponse.json()

        // Validate business/creator account
        if (userData.account_type && !['BUSINESS', 'CREATOR'].includes(userData.account_type)) {
          logger.warn('[ProviderRegistry] Instagram personal account detected:', userData.account_type)
        }

        return {
          username: userData.username,
          account_name: userData.username,
          provider_user_id: userData.id,
          avatar_url: userData.profile_picture_url || null,
          account_type: userData.account_type,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Instagram user info:', error)
        return {}
      }
    },
  }),
})

register('paypal', {
  config: (baseUrl) => ({
    provider: 'paypal',
    tokenEndpoint: 'https://api-m.paypal.com/v1/oauth2/token', // Dynamic in customTokenExchange
    clientId: process.env.PAYPAL_CLIENT_ID!,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
    getRedirectUri: (base) => process.env.PAYPAL_REDIRECT_URI || `${base}/api/integrations/paypal/callback`,
    requiresPkce: true,
    // PayPal uses Basic auth + sandbox/production domain switching
    customTokenExchange: async ({ code, redirectUri, clientId, clientSecret }) => {
      const isSandbox = clientId.includes('sandbox') || process.env.PAYPAL_SANDBOX === 'true'
      const domain = isSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com'

      const response = await fetch(`https://${domain}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error_description || 'Failed to exchange PayPal token')
      }
      const tokenData = await response.json()
      // Attach domain info for user info fetch
      tokenData._paypal_domain = domain
      return tokenData
    },
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
    }),
    additionalIntegrationData: async (tokenData) => {
      const domain = tokenData._paypal_domain || 'api-m.paypal.com'
      const headers = { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' }

      let email: string | null = null
      let name: string | null = null
      let accountId: string | null = null

      // Endpoint 1: OpenID Connect userinfo
      try {
        const response = await fetch(`https://${domain}/v1/identity/openidconnect/userinfo?schema=openid`, { headers })
        if (response.ok) {
          const data = await response.json()
          email = data.email || data.emails?.[0]?.value
          name = data.name || (data.given_name && data.family_name ? `${data.given_name} ${data.family_name}` : null)
          accountId = data.payer_id || data.sub || data.user_id
        }
      } catch { /* continue */ }

      // Endpoint 2: Token userinfo (fallback)
      if (!email) {
        try {
          const response = await fetch(`https://${domain}/v1/oauth2/token/userinfo?schema=openid`, { headers })
          if (response.ok) {
            const data = await response.json()
            email = email || data.emails?.[0]?.value || data.email
            name = name || data.name || (data.given_name && data.family_name ? `${data.given_name} ${data.family_name}` : null)
            accountId = accountId || data.payer_id || data.sub || data.account_id
          }
        } catch { /* continue */ }
      }

      return {
        email,
        username: name,
        account_name: name || email,
        provider_user_id: accountId,
      }
    },
  }),
})

// ----------------------------------------------------------------
// COMPLEX PROVIDERS — Batch C
// ----------------------------------------------------------------

register('notion', {
  config: (baseUrl) => ({
    provider: 'notion',
    tokenEndpoint: 'https://api.notion.com/v1/oauth/token',
    clientId: process.env.NOTION_CLIENT_ID!,
    clientSecret: process.env.NOTION_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/notion/callback`,
    requiresPkce: true,
    // Notion uses JSON body + Basic auth
    customTokenExchange: async ({ code, redirectUri, clientId, clientSecret }) => {
      const response = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to exchange Notion token')
      }
      return response.json()
    },
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: null, // Notion doesn't provide refresh tokens
      scopes: [],
      // Tokens never truly expire — set 1-year nominal expiration
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    }),
    additionalIntegrationData: async (tokenData) => {
      let avatarUrl: string | null = null
      let ownerEmail: string | null = null
      let ownerName: string | null = null

      // Fetch users list to find bot owner info
      try {
        const usersResponse = await fetch('https://api.notion.com/v1/users', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'Notion-Version': '2022-06-28',
          },
        })
        if (usersResponse.ok) {
          const usersData = await usersResponse.json()
          // Find bot user for avatar
          const botUser = usersData.results?.find((u: any) => u.type === 'bot')
          if (botUser) {
            avatarUrl = botUser.avatar_url || null
          }
          // Find first person user for email
          const personUser = usersData.results?.find((u: any) => u.type === 'person')
          if (personUser) {
            ownerEmail = personUser.person?.email || null
            ownerName = personUser.name || null
          }
        }
      } catch { /* continue */ }

      return {
        email: ownerEmail,
        username: ownerName,
        account_name: tokenData.workspace_name || ownerName || ownerEmail,
        avatar_url: tokenData.workspace_icon || avatarUrl,
        provider_user_id: tokenData.owner?.user?.id || tokenData.bot_id,
        workspace_id: tokenData.workspace_id,
        workspace_name: tokenData.workspace_name,
        workspace_icon: tokenData.workspace_icon,
        bot_id: tokenData.bot_id,
        owner_type: tokenData.owner?.type,
      }
    },
  }),
})

register('shopify', {
  config: (baseUrl) => ({
    provider: 'shopify',
    tokenEndpoint: 'https://placeholder.myshopify.com/admin/oauth/access_token', // Dynamic
    clientId: process.env.SHOPIFY_CLIENT_ID!,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET!,
    getRedirectUri: (base) => `${base}/api/integrations/shopify/callback`,
    // Shopify uses dynamic token URL based on shop parameter + JSON body
    customTokenExchange: async ({ code, clientId, clientSecret, request }) => {
      const url = new URL(request.url)
      const shop = url.searchParams.get('shop')
      if (!shop) throw new Error('Missing shop parameter in Shopify callback')

      const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error_description || 'Failed to exchange Shopify token')
      }
      const tokenData = await response.json()
      tokenData._shop = shop // Attach for additionalIntegrationData
      return tokenData
    },
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: null,
      scopes: tokenData.scope ? tokenData.scope.split(',') : [],
      expires_at: null, // Shopify offline tokens don't expire
    }),
    additionalIntegrationData: async (tokenData) => {
      const shop = tokenData._shop
      if (!shop) return {}

      try {
        const shopResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
          headers: { 'X-Shopify-Access-Token': tokenData.access_token },
        })
        if (!shopResponse.ok) return { shop_domain: shop }
        const shopData = await shopResponse.json()
        const shopInfo = shopData.shop
        return {
          email: shopInfo.email,
          username: shopInfo.name,
          account_name: shopInfo.name || shop,
          provider_user_id: shopInfo.id,
          shop_domain: shop,
          shop_name: shopInfo.name,
          shop_plan: shopInfo.plan_name,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Shopify shop info:', error)
        return { shop_domain: shop }
      }
    },
  }),
})

register('trello', {
  preHandler: async (request: NextRequest) => {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const baseUrl = getBaseUrl()

    // If no token, redirect to client auth page
    if (!token) {
      const { NextResponse } = await import('next/server')
      return NextResponse.redirect(`${baseUrl}/apps/trello-auth`)
    }
    return null // Continue to normal flow
  },
  config: (baseUrl) => ({
    provider: 'trello',
    tokenEndpoint: '', // Not used — Trello passes token directly
    clientId: process.env.TRELLO_CLIENT_ID!,
    clientSecret: '',
    getRedirectUri: () => '',
    // Trello is not OAuth2 — token comes directly in query params
    parseState: (request: NextRequest) => {
      const { searchParams } = new URL(request.url)
      const state = searchParams.get('state')
      const userId = searchParams.get('userId')
      // Try state first, then userId param
      if (state) {
        try { return JSON.parse(atob(state)) } catch { /* fall through */ }
      }
      return { userId: userId || '', provider: 'trello' }
    },
    customTokenExchange: async ({ request }) => {
      // Trello already has the token in URL params — no exchange needed
      const { searchParams } = new URL(request.url)
      const token = searchParams.get('token')
      const key = searchParams.get('key') || process.env.TRELLO_CLIENT_ID
      return { access_token: token, key }
    },
    transformTokenData: (tokenData) => ({
      access_token: tokenData.access_token,
      refresh_token: null,
      scopes: [],
      expires_at: null,
    }),
    additionalIntegrationData: async (tokenData) => {
      const key = tokenData.key || process.env.TRELLO_CLIENT_ID
      try {
        const memberResponse = await fetch(
          `https://api.trello.com/1/members/me?key=${key}&token=${tokenData.access_token}`
        )
        if (!memberResponse.ok) return { client_key: key }
        const member = await memberResponse.json()

        let avatarUrl = member.avatarUrl
        if (!avatarUrl && member.avatarHash) {
          avatarUrl = `https://trello-members.s3.amazonaws.com/${member.id}/${member.avatarHash}/170.png`
        }

        return {
          email: member.email,
          username: member.username,
          account_name: member.fullName || member.username,
          provider_user_id: member.id,
          avatar_url: avatarUrl || null,
          client_key: key,
        }
      } catch (error) {
        logger.error('[ProviderRegistry] Error fetching Trello member info:', error)
        return { client_key: key }
      }
    },
    onSuccess: async (integrationId) => {
      // Background: register webhooks
      const base = getBaseUrl()
      try {
        fetch(`${base}/api/integrations/trello/register-webhooks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integrationId }),
        }).catch(() => {})
      } catch { /* non-fatal */ }
    },
    // Trello returns JSON response, not popup HTML
    customResponse: ({ type, provider, message }) => {
      return jsonResponse({
        success: type === 'success',
        message,
        provider,
      })
    },
  }),
})
