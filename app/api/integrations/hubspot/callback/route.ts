import { type NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  
  const baseUrl = getBaseUrl()
  const provider = 'hubspot'

  // Handle OAuth errors
  if (error) {
    logger.error(`HubSpot OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || 'Authorization failed', baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'Missing code or state parameter', baseUrl)
  }

  try {
    // Verify state parameter to prevent CSRF - UPDATED to use pkce_flow table
    const { data: pkceData, error: pkceError } = await createAdminClient()
      .from('pkce_flow')
      .select('*')
      .eq('state', state)
      .single()

    if (pkceError || !pkceData) {
      logger.error('Invalid state or PKCE lookup error:', pkceError)
      return createPopupResponse('error', provider, 'Invalid state parameter', baseUrl)
    }

    // Parse state to get user ID
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      logger.error('Failed to parse state:', e);
      return createPopupResponse('error', provider, 'Invalid state format', baseUrl);
    }
    
    const userId = stateData.userId;
    
    if (!userId) {
      return createPopupResponse('error', provider, 'User ID not found in state', baseUrl)
    }

    // Clean up the state
    await createAdminClient()
      .from('pkce_flow')
      .delete()
      .eq('state', state)

    // Get HubSpot OAuth credentials
    const clientId = process.env.HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/hubspot/callback`

    if (!clientId || !clientSecret) {
      logger.error('HubSpot OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      logger.error('HubSpot token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    
    logger.debug('📡 [HubSpot Callback] Token exchange response:', {
      hasAccessToken: !!tokenData.access_token,
      accessTokenPreview: tokenData.access_token ? `${tokenData.access_token.substring(0, 30) }...` : 'none',
      hasRefreshToken: !!tokenData.refresh_token,
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
      hubId: tokenData.hub_id
    })
    
    // Extract token expiration time
    const expiresIn = tokenData.expires_in || 21600 // Default to 6 hours if not specified
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    
    // HubSpot refresh tokens don't expire by default unless revoked
    // But we'll set a nominal expiration for safety
    const refreshExpiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) // 180 days
    
    // Get HubSpot account information
    let accountInfo = {}
    if (tokenData.access_token) {
      try {
        // Get the HubSpot account details
        const accountResponse = await fetch('https://api.hubapi.com/integrations/v1/me', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        })

        if (accountResponse.ok) {
          accountInfo = await accountResponse.json()
        } else {
          logger.warn('Could not fetch HubSpot account information:', await accountResponse.text())
        }
      } catch (accountError) {
        logger.warn('Error fetching HubSpot account information:', accountError)
      }
    }

    const encryptionKey = process.env.ENCRYPTION_KEY

    if (!encryptionKey) {
      return createPopupResponse('error', provider, 'Encryption key not configured', baseUrl)
    }

    // Store the integration data
    const supabase = createAdminClient()
    const { error: upsertError } = await supabase.from('integrations').upsert({
      user_id: userId,
      provider,
      access_token: encrypt(tokenData.access_token, encryptionKey),
      refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token, encryptionKey) : null,
      expires_at: expiresAt.toISOString(),
      refresh_token_expires_at: refreshExpiresAt.toISOString(),
      status: 'connected',
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        hub_id: tokenData.hub_id,
        hub_domain: tokenData.hub_domain,
        account_info: accountInfo,
        token_type: tokenData.token_type,
        scopes: tokenData.scope ? tokenData.scope.split(' ') : []
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      logger.error('Failed to save HubSpot integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'HubSpot connected successfully!', baseUrl)
  } catch (error) {
    logger.error('HubSpot callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
