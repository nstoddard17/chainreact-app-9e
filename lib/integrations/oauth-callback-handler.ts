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
      config.getRedirectUri(baseUrl)
    )

    // Transform token data to standard format
    const standardTokenData = config.transformTokenData(tokenData)

    // Save integration to database
    const integrationId = await saveIntegration(
      stateObject,
      config.provider,
      standardTokenData,
      config.additionalIntegrationData?.(tokenData, stateObject)
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
  redirectUri: string
): Promise<any> {
  const tokenResponse = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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

  // Store provider-specific data in metadata JSONB column
  // Common fields that can be top-level: team_id, team_name (for Slack)
  // Account identification fields: email, username, account_name (for ServiceConnectionSelector display)
  if (additionalData) {
    // Extract top-level fields that have actual columns
    const topLevelFields = [
      'team_id', 'team_name', 'app_id', 'authed_user_id',
      'token_type', 'bot_scopes', 'user_scopes', 'has_user_token',
      'user_token', 'user_refresh_token',
      // Account display fields for ServiceConnectionSelector
      'email', 'username', 'account_name'
    ]

    const metadata: Record<string, any> = {}
    const topLevel: Record<string, any> = {}

    for (const [key, value] of Object.entries(additionalData)) {
      if (topLevelFields.includes(key)) {
        topLevel[key] = value
      } else {
        // Store other fields in metadata (google_id, picture, etc.)
        metadata[key] = value
      }
    }

    // Add top-level fields directly
    Object.assign(integrationData, topLevel)

    // Store the rest in metadata
    if (Object.keys(metadata).length > 0) {
      integrationData.metadata = metadata
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
    // Insert new integration
    // For personal, use upsert with conflict resolution
    if (workspaceType === 'personal') {
      const { data, error } = await supabase
        .from('integrations')
        .upsert(integrationData, {
          onConflict: 'user_id, provider',
        })
        .select('id')
        .single()

      if (error) {
        logger.error('Error upserting integration:', error)
        throw new Error(`Database Error: ${error.message}`)
      }

      return data.id
    } else {
      // For team/org, just insert (multiple allowed)
      const { data, error } = await supabase
        .from('integrations')
        .insert(integrationData)
        .select('id')
        .single()

      if (error) {
        logger.error('Error inserting integration:', error)
        throw new Error(`Database Error: ${error.message}`)
      }

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
