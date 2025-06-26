import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

interface InstagramBusinessAccount {
  id: string;
  username?: string;
  account_type?: string;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorReason = url.searchParams.get('error_reason')
  const errorDescription = url.searchParams.get('error_description')
  
  const baseUrl = getBaseUrl()
  const provider = 'instagram'

  // Handle OAuth errors
  if (error) {
    console.error(`Instagram OAuth error: ${error} - ${errorReason} - ${errorDescription}`)
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
      console.error('Invalid state or PKCE lookup error:', pkceError)
      return createPopupResponse('error', provider, 'Invalid state parameter', baseUrl)
    }

    // Parse state to get user ID
    let stateData;
    try {
      stateData = JSON.parse(atob(state));
    } catch (e) {
      console.error('Failed to parse state:', e);
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

    // Get Instagram OAuth credentials
    const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/instagram/callback`

    if (!clientId || !clientSecret) {
      console.error('Instagram OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for Instagram access token
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code
      }).toString()
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Instagram token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    
    // The response format according to documentation is:
    // { "access_token": "...", "user_id": "...", "permissions": "..." }
    const shortLivedToken = tokenData.access_token
    const userId_instagram = tokenData.user_id
    const grantedPermissions = tokenData.permissions || ''
    
    console.log('Instagram permissions granted:', grantedPermissions)

    // Exchange short-lived token for long-lived token
    const longLivedTokenResponse = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${shortLivedToken}`
    )

    if (!longLivedTokenResponse.ok) {
      console.error('Failed to exchange for long-lived token:', await longLivedTokenResponse.text())
      return createPopupResponse('error', provider, 'Failed to obtain long-lived access token', baseUrl)
    }

    const longLivedTokenData = await longLivedTokenResponse.json()
    const longLivedToken = longLivedTokenData.access_token
    const expiresIn = longLivedTokenData.expires_in || 60 * 24 * 60 * 60 // Default to 60 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // Get basic account info
    const userInfoResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type&access_token=${longLivedToken}`
    )

    if (!userInfoResponse.ok) {
      console.error('Failed to fetch Instagram user info:', await userInfoResponse.text())
      return createPopupResponse('error', provider, 'Failed to fetch account information', baseUrl)
    }

    const userInfo = await userInfoResponse.json()

    // Verify this is a business or creator account
    if (userInfo.account_type !== 'BUSINESS' && userInfo.account_type !== 'CREATOR') {
      return createPopupResponse('error', provider, 'This API requires an Instagram Professional account (Business or Creator)', baseUrl)
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
      access_token: encrypt(longLivedToken, encryptionKey),
      refresh_token: null, // Instagram API with Instagram Login doesn't provide refresh tokens
      expires_at: expiresAt.toISOString(),
      status: 'connected',
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        instagram_account_id: userInfo.id,
        instagram_username: userInfo.username,
        account_type: userInfo.account_type,
        granted_permissions: grantedPermissions
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Failed to save Instagram integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'Instagram Professional account connected successfully!', baseUrl)
  } catch (error) {
    console.error('Instagram callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
