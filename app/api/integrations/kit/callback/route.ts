import { type NextRequest, NextResponse } from 'next/server'
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
  const provider = 'kit'

  // Handle OAuth errors
  if (error) {
    logger.error(`Kit OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || 'Authorization failed', baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'Missing code or state parameter', baseUrl)
  }

  try {
    // Verify state parameter to prevent CSRF
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

    // Get Kit OAuth credentials
    const clientId = process.env.KIT_CLIENT_ID
    const clientSecret = process.env.KIT_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/kit/callback`

    if (!clientId || !clientSecret) {
      logger.error('Kit OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://api.kit.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      logger.error('Kit token exchange failed:', tokenResponse.status, errorText)
      
      let errorMessage = 'Failed to retrieve access token';
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (e) {
        logger.error('Could not parse Kit error:', e);
      }
      
      return createPopupResponse('error', provider, errorMessage, baseUrl)
    }

    const tokenData = await tokenResponse.json()
    logger.debug('Kit token data:', JSON.stringify(tokenData))
    
    if (!tokenData.access_token) {
      return createPopupResponse('error', provider, 'No access token in response', baseUrl)
    }
    
    // Kit access tokens typically expire in 30 days (2592000 seconds)
    const expiresIn = tokenData.expires_in || 2592000
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // Fetch account information
    let accountInfo = {};
    try {
      const accountResponse = await fetch('https://api.kit.com/account', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (accountResponse.ok) {
        accountInfo = await accountResponse.json()
        logger.debug('Kit account info:', JSON.stringify(accountInfo))
      } else {
        logger.warn('Could not fetch Kit account information:', await accountResponse.text())
      }
    } catch (accountError) {
      logger.warn('Error fetching Kit account information:', accountError)
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
      status: 'connected',
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        account_info: accountInfo,
        scope: tokenData.scope
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      logger.error('Failed to save Kit integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'Kit connected successfully!', baseUrl)
  } catch (error) {
    logger.error('Kit callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
} 