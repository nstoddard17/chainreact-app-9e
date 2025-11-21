/**
 * OAuth Callback Handler Utility
 *
 * Centralized OAuth callback logic with workspace context support.
 * Handles token exchange, integration storage, and permission granting.
 *
 * Created: 2025-10-28
 *
 * Usage:
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   return handleOAuthCallback(request, {
 *     provider: 'gmail',
 *     tokenEndpoint: 'https://oauth2.googleapis.com/token',
 *     clientId: process.env.GOOGLE_CLIENT_ID!,
 *     clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
 *     getRedirectUri: (baseUrl) => `${baseUrl}/api/integrations/gmail/callback`,
 *     transformTokenData: (tokenData) => ({
 *       access_token: tokenData.access_token,
 *       refresh_token: tokenData.refresh_token,
 *       scopes: tokenData.scope?.split(' ') || [],
 *       expires_at: tokenData.expires_in
 *         ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
 *         : null
 *     })
 *   })
 * }
 * ```
 */

import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'
import { autoGrantPermissionsForIntegration } from '@/lib/services/integration-permissions'

// ================================================================
// TYPES
// ================================================================

export interface OAuthState {
  userId: string
  provider: string
  reconnect?: boolean
  integrationId?: string
  // NEW: Workspace context
  workspaceType?: 'personal' | 'organization' | 'team'
  workspaceId?: string
}

export interface TokenData {
  access_token: string
  refresh_token?: string | null
  scopes: string[]
  expires_at: string | null
  [key: string]: any // Allow provider-specific fields
}

export interface OAuthCallbackConfig {
  provider: string
  tokenEndpoint: string
  clientId: string
  clientSecret: string
  getRedirectUri: (baseUrl: string) => string
  transformTokenData: (tokenData: any) => TokenData
  additionalIntegrationData?: (tokenData: any, state: OAuthState) => Record<string, any>
  onSuccess?: (integrationId: string, state: OAuthState) => Promise<void>
  // GitHub returns URL-encoded by default, needs JSON Accept header
  useJsonResponse?: boolean
}

// ================================================================
// MAIN HANDLER
// ================================================================

/**
 * Centralized OAuth callback handler
 * Handles the complete OAuth flow with workspace context
 */
export async function handleOAuthCallback(
  request: NextRequest,
  config: OAuthCallbackConfig
) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const baseUrl = getBaseUrl()

  logger.debug(`🔍 ${config.provider} callback called:`, {
    url: url.toString(),
    hasCode: !!code,
    hasState: !!state,
    error,
    userAgent: request.headers.get('user-agent'),
  })

  // Handle OAuth errors
  if (error) {
    logger.error(`Error with ${config.provider} OAuth: ${error}`)
    return createPopupResponse('error', config.provider, `OAuth Error: ${error}`, baseUrl)
  }

  // Validate required params
  if (!code || !state) {
    return createPopupResponse(
      'error',
      config.provider,
      `No code or state provided for ${config.provider} OAuth.`,
      baseUrl
    )
  }

  try {
    // Parse state
    const stateObject = parseOAuthState(state)

    if (!stateObject.userId) {
      return createPopupResponse(
        'error',
        config.provider,
        `Missing userId in ${config.provider} state.`,
        baseUrl
      )
    }

    logger.debug(`${config.provider} OAuth callback state:`, {
      userId: stateObject.userId,
      provider: stateObject.provider,
      reconnect: stateObject.reconnect,
      integrationId: stateObject.integrationId,
      workspaceType: stateObject.workspaceType,
      workspaceId: stateObject.workspaceId,
    })

    // Exchange code for tokens
    const tokenData = await exchangeCodeForToken(
      code,
      config.tokenEndpoint,
      config.clientId,
      config.clientSecret,
      config.getRedirectUri(baseUrl),
      config.useJsonResponse
    )

    // Transform token data to standard format
    const standardTokenData = config.transformTokenData(tokenData)

    // Fetch additional integration data (e.g., email, avatar) if provided
    const additionalData = config.additionalIntegrationData
      ? await config.additionalIntegrationData(tokenData, stateObject)
      : undefined

    // Save integration to database
    const integrationId = await saveIntegration(
      stateObject,
      config.provider,
      standardTokenData,
      additionalData
    )

    // Auto-grant permissions based on workspace context
    await grantWorkspacePermissions(
      integrationId,
      stateObject
    )

    // Call custom success handler if provided
    if (config.onSuccess) {
      await config.onSuccess(integrationId, stateObject)
    }

    logger.debug(`✅ ${config.provider} integration successfully saved`)

    return createPopupResponse(
      'success',
      config.provider,
      `${config.provider} connected successfully!`,
      baseUrl
    )
  } catch (error) {
    logger.error(`Error during ${config.provider} OAuth callback:`, error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', config.provider, message, baseUrl)
  }
}

// ================================================================
// HELPER FUNCTIONS
// ================================================================

/**
 * Parse OAuth state parameter
 */
function parseOAuthState(state: string): OAuthState {
  try {
    return JSON.parse(atob(state))
  } catch (error) {
    throw new Error('Invalid state parameter')
  }
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(
  code: string,
  tokenEndpoint: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  useJsonResponse?: boolean
): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }

  // GitHub needs Accept: application/json to return JSON instead of URL-encoded
  if (useJsonResponse) {
    headers['Accept'] = 'application/json'
  }

  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json()
    logger.error('Failed to exchange code for token:', errorData)
    throw new Error(errorData.error_description || 'Failed to get access token')
  }

  return tokenResponse.json()
}

/**
 * Save integration to database with workspace context
 */
async function saveIntegration(
  state: OAuthState,
  provider: string,
  tokenData: TokenData,
  additionalData?: Record<string, any>
): Promise<string> {
  const supabase = createAdminClient()

  // Get encryption key
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    throw new Error('Encryption key not configured')
  }

  // Determine workspace context (default to personal)
  const workspaceType = state.workspaceType || 'personal'
  const workspaceId = state.workspaceId || null

  // Build integration data
  const integrationData: any = {
    provider,
    access_token: encrypt(tokenData.access_token, encryptionKey),
    refresh_token: tokenData.refresh_token
      ? encrypt(tokenData.refresh_token, encryptionKey)
      : null,
    scopes: tokenData.scopes,
    status: 'connected',
    expires_at: tokenData.expires_at,
    updated_at: new Date().toISOString(),
    // Clear disconnect fields on successful connection
    disconnect_reason: null,
    disconnected_at: null,
    // NEW: Workspace context
    workspace_type: workspaceType,
    workspace_id: workspaceId,
    connected_by: state.userId,
  }

  // For personal integrations, keep user_id for backward compatibility
  if (workspaceType === 'personal') {
    integrationData.user_id = state.userId
  } else {
    integrationData.user_id = null
  }

  // Extract account identity fields from additionalData and store as top-level fields
  // This makes them easier to query and display in the UI
  if (additionalData) {
    // Extract email (try multiple common field names)
    const email = additionalData.email || additionalData.userEmail || null
    if (email) {
      integrationData.email = email
    }

    // Extract username (try multiple common field names)
    const username = additionalData.username || additionalData.name || additionalData.user_name || null
    if (username) {
      integrationData.username = username
    }

    // Extract account_name (try multiple common field names)
    const accountName = additionalData.account_name || additionalData.accountName ||
                        additionalData.name || additionalData.real_name || email || null
    if (accountName) {
      integrationData.account_name = accountName
    }

    // Extract avatar_url (try multiple common field names)
    const avatarUrl = additionalData.avatar_url || additionalData.avatarUrl ||
                      additionalData.avatar || additionalData.picture ||
                      additionalData.profile_image || additionalData.profile_picture ||
                      additionalData.photo || null
    if (avatarUrl) {
      integrationData.avatar_url = avatarUrl
    }

    // Extract provider_user_id (try multiple common field names)
    const providerUserId = additionalData.provider_user_id || additionalData.providerUserId ||
                           additionalData.user_id || additionalData.userId ||
                           additionalData.id || null
    if (providerUserId) {
      integrationData.provider_user_id = providerUserId
    }

    // NEW: Set provider_account_id for multi-account deduplication (non-email accounts)
    // This is used when email is not available (e.g., Airtable, Trello)
    const providerAccountId = additionalData.provider_account_id || additionalData.account_id ||
                              additionalData.workspace_id || providerUserId || null
    if (providerAccountId) {
      integrationData.provider_account_id = String(providerAccountId)
    }

    // NEW: Set display_name for account selector UI
    // This is shown in dropdowns when user has multiple accounts
    const displayName = email || accountName || username ||
                        additionalData.display_name || additionalData.team_name ||
                        `${provider} Account`
    integrationData.display_name = displayName

    // Store all provider-specific data in metadata JSONB column for additional info
    if (Object.keys(additionalData).length > 0) {
      integrationData.metadata = {
        ...(integrationData.metadata || {}),
        ...additionalData
      }
    }
  }

  // Handle reconnect vs new connection
  if (state.reconnect && state.integrationId) {
    // Update existing integration
    const { error } = await supabase
      .from('integrations')
      .update(integrationData)
      .eq('id', state.integrationId)

    if (error) {
      logger.error('Error updating integration:', error)
      throw new Error(`Database Error: ${error.message}`)
    }

    logger.debug(`✅ Updated existing integration: ${state.integrationId}`)
    return state.integrationId
  } else {
    // ACCOUNT-BASED DEDUPLICATION: Check if this account already exists
    // This allows multiple accounts per provider (different emails/account_ids = different integrations)
    const email = integrationData.email
    const providerAccountId = integrationData.provider_account_id

    if (workspaceType === 'personal') {
      let existingIntegration = null

      // First, try to find by email if available
      if (email) {
        const { data } = await supabase
          .from('integrations')
          .select('id')
          .eq('user_id', state.userId)
          .eq('provider', provider)
          .eq('email', email)
          .eq('workspace_type', 'personal')
          .single()
        existingIntegration = data
      }

      // If no email match, try provider_account_id (for non-email providers like Airtable)
      if (!existingIntegration && providerAccountId) {
        const { data } = await supabase
          .from('integrations')
          .select('id')
          .eq('user_id', state.userId)
          .eq('provider', provider)
          .eq('provider_account_id', providerAccountId)
          .eq('workspace_type', 'personal')
          .single()
        existingIntegration = data
      }

      if (existingIntegration) {
        // Update existing integration (refresh tokens for same account)
        const { error } = await supabase
          .from('integrations')
          .update(integrationData)
          .eq('id', existingIntegration.id)

        if (error) {
          logger.error('Error updating integration by account:', error)
          throw new Error(`Database Error: ${error.message}`)
        }

        logger.debug(`✅ Updated existing integration by account: ${existingIntegration.id}`)
        return existingIntegration.id
      }
    }

    // If email is different or doesn't exist, insert as new integration
    // This allows multiple accounts per provider
    if (workspaceType === 'personal') {
      const { data, error } = await supabase
        .from('integrations')
        .insert(integrationData)
        .select('id')
        .single()

      if (error) {
        logger.error('Error inserting integration:', error)
        throw new Error(`Database Error: ${error.message}`)
      }

      logger.debug(`✅ Created new integration: ${data.id}`)
      return data.id
    } else {
      // For team/org, check by email if available
      if (email) {
        const { data: existingIntegration } = await supabase
          .from('integrations')
          .select('id')
          .eq('provider', provider)
          .eq('email', email)
          .eq('workspace_type', workspaceType)
          .eq('workspace_id', workspaceId)
          .single()

        if (existingIntegration) {
          // Update existing team/org integration
          const { error } = await supabase
            .from('integrations')
            .update(integrationData)
            .eq('id', existingIntegration.id)

          if (error) {
            logger.error('Error updating team/org integration:', error)
            throw new Error(`Database Error: ${error.message}`)
          }

          logger.debug(`✅ Updated existing team/org integration: ${existingIntegration.id}`)
          return existingIntegration.id
        }
      }

      // Insert new team/org integration
      const { data, error } = await supabase
        .from('integrations')
        .insert(integrationData)
        .select('id')
        .single()

      if (error) {
        logger.error('Error inserting integration:', error)
        throw new Error(`Database Error: ${error.message}`)
      }

      logger.debug(`✅ Created new team/org integration: ${data.id}`)
      return data.id
    }
  }
}

/**
 * Grant permissions based on workspace context
 */
async function grantWorkspacePermissions(
  integrationId: string,
  state: OAuthState
): Promise<void> {
  // Skip permission granting for reconnects (permissions already exist)
  if (state.reconnect) {
    logger.debug('Skipping permission grant for reconnect')
    return
  }

  const workspaceType = state.workspaceType || 'personal'
  const workspaceId = state.workspaceId || undefined

  const workspaceContext = {
    type: workspaceType,
    id: workspaceId,
  }

  logger.debug('Granting permissions for workspace context:', workspaceContext)

  const result = await autoGrantPermissionsForIntegration(
    integrationId,
    workspaceContext,
    state.userId
  )

  if (!result.success) {
    logger.error('Failed to grant permissions:', result.error)
    throw new Error(`Failed to grant permissions: ${result.error}`)
  }

  logger.debug('✅ Permissions granted successfully')
}

// ================================================================
// STATE BUILDER UTILITY
// ================================================================

/**
 * Build OAuth state parameter with workspace context
 * Use this when initiating OAuth flow
 */
export function buildOAuthState(params: {
  userId: string
  provider: string
  reconnect?: boolean
  integrationId?: string
  workspaceType?: 'personal' | 'organization' | 'team'
  workspaceId?: string
}): string {
  const state: OAuthState = {
    userId: params.userId,
    provider: params.provider,
    reconnect: params.reconnect,
    integrationId: params.integrationId,
    workspaceType: params.workspaceType || 'personal',
    workspaceId: params.workspaceId,
  }

  return btoa(JSON.stringify(state))
}
