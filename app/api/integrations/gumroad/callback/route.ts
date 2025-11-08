import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'
import { autoGrantPermissionsForIntegration } from '@/lib/services/integration-permissions'

/**
 * Gumroad OAuth Callback Handler
 *
 * Handles the OAuth callback from Gumroad with PKCE support.
 * Gumroad requires PKCE (Proof Key for Code Exchange) for OAuth flow.
 *
 * Note: Gumroad tokens don't expire, but we set a 1-year expiration for safety.
 *
 * Updated: 2025-01-08 - Custom handler for PKCE support
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const baseUrl = getBaseUrl()
  const provider = 'gumroad'

  logger.debug(`🔍 ${provider} callback called:`, {
    url: url.toString(),
    hasCode: !!code,
    hasState: !!state,
    error,
  })

  // Handle OAuth errors
  if (error) {
    logger.error(`Error with ${provider} OAuth: ${error}`)
    return createPopupResponse('error', provider, `OAuth Error: ${error}`, baseUrl)
  }

  // Validate required params
  if (!code || !state) {
    return createPopupResponse(
      'error',
      provider,
      'Missing code or state parameter',
      baseUrl
    )
  }

  try {
    // Look up PKCE data from database
    const supabase = createAdminClient()
    const { data: pkceData, error: pkceError } = await supabase
      .from('pkce_flow')
      .select('*')
      .eq('state', state)
      .eq('provider', provider)
      .single()

    if (pkceError || !pkceData) {
      logger.error('Invalid state or PKCE lookup error:', pkceError)
      return createPopupResponse('error', provider, 'Invalid state parameter', baseUrl)
    }

    // Parse state to get user ID and workspace context
    let stateObject
    try {
      stateObject = JSON.parse(atob(state))
    } catch (e) {
      logger.error('Failed to parse state:', e)
      return createPopupResponse('error', provider, 'Invalid state format', baseUrl)
    }

    const userId = stateObject.userId
    if (!userId) {
      return createPopupResponse('error', provider, 'User ID not found in state', baseUrl)
    }

    // Clean up the PKCE state
    await supabase
      .from('pkce_flow')
      .delete()
      .eq('state', state)

    // Get OAuth credentials
    const clientId = process.env.GUMROAD_CLIENT_ID
    const clientSecret = process.env.GUMROAD_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/gumroad/callback`

    if (!clientId || !clientSecret) {
      logger.error('Gumroad OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token with PKCE code_verifier
    const tokenResponse = await fetch('https://api.gumroad.com/oauth/token', {
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
        code_verifier: pkceData.code_verifier, // PKCE: Include code verifier
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      logger.error('Gumroad token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()

    // Fetch user profile
    const meResponse = await fetch('https://api.gumroad.com/v2/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    })

    let userProfile = null
    if (meResponse.ok) {
      const meData = await meResponse.json()
      if (meData.success && meData.user) {
        userProfile = {
          email: meData.user.email,
          name: meData.user.name,
          userId: meData.user.user_id,
          bio: meData.user.bio,
          twitter_handle: meData.user.twitter_handle
        }
      }
    }

    // Get encryption key
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      return createPopupResponse('error', provider, 'Encryption key not configured', baseUrl)
    }

    // Gumroad tokens don't expire, set 1 year for safety
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)

    // Determine workspace context (default to personal)
    const workspaceType = stateObject.workspaceType || 'personal'
    const workspaceId = stateObject.workspaceId || null

    // Build integration data
    // Note: email, username, account_name go in metadata (no DB columns for these)
    const integrationData: any = {
      provider,
      access_token: encrypt(tokenData.access_token, encryptionKey),
      refresh_token: null, // Gumroad doesn't provide refresh tokens
      status: 'connected',
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
      workspace_type: workspaceType,
      workspace_id: workspaceId,
      connected_by: userId,
      metadata: userProfile ? {
        user_id: userProfile.userId,
        email: userProfile.email,
        username: userProfile.name,
        account_name: userProfile.name || userProfile.email,
        bio: userProfile.bio,
        twitter_handle: userProfile.twitter_handle
      } : {}
    }

    // For personal integrations, keep user_id for backward compatibility
    if (workspaceType === 'personal') {
      integrationData.user_id = userId
    } else {
      integrationData.user_id = null
    }

    // Check if this is a reconnection
    let integrationId: string
    if (stateObject.reconnect && stateObject.integrationId) {
      // Update existing integration
      const { error: updateError } = await supabase
        .from('integrations')
        .update(integrationData)
        .eq('id', stateObject.integrationId)

      if (updateError) {
        logger.error('Failed to update Gumroad integration:', updateError)
        return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
      }

      integrationId = stateObject.integrationId
    } else {
      // Create new integration
      const { data: newIntegration, error: insertError } = await supabase
        .from('integrations')
        .insert(integrationData)
        .select()
        .single()

      if (insertError || !newIntegration) {
        logger.error('Failed to save Gumroad integration:', insertError)
        return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
      }

      integrationId = newIntegration.id
    }

    // Auto-grant permissions based on workspace context
    try {
      await autoGrantPermissionsForIntegration(integrationId, workspaceType, workspaceId, userId)
    } catch (permError) {
      logger.warn('Failed to auto-grant permissions:', permError)
      // Don't fail the whole flow if permissions fail
    }

    logger.debug(`✅ ${provider} integration successfully saved`)

    return createPopupResponse(
      'success',
      provider,
      'Gumroad connected successfully!',
      baseUrl,
      {
        payload: {
          integrationId,
          email: userProfile?.email,
          accountName: userProfile?.name,
          userId: userProfile?.userId
        }
      }
    )
  } catch (error) {
    logger.error(`Error during ${provider} OAuth callback:`, error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
