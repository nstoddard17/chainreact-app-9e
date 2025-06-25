import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  
  const baseUrl = getBaseUrl()
  const provider = 'tiktok'

  // Handle OAuth errors
  if (error) {
    console.error(`TikTok OAuth error: ${error} - ${errorDescription}`)
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

    // Get TikTok OAuth credentials
    const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/tiktok/callback`

    if (!clientId || !clientSecret) {
      console.error('TikTok OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token - UPDATED to use v2 endpoint
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('TikTok token exchange failed:', tokenResponse.status, errorText)
      
      // Add better error handling for common TikTok API errors
      let errorMessage = 'Failed to retrieve access token';
      try {
        const errorData = JSON.parse(errorText);
        
        // Handle specific error types
        if (errorData.error && errorData.error.code === 10004) {
          // This is a redirect_uri error
          errorMessage = `Redirect URI mismatch. Please ensure '${redirectUri}' is added to your TikTok app settings.`;
          console.error('TikTok redirect URI mismatch. Using:', redirectUri);
        } else if (errorData.error && errorData.error.message) {
          errorMessage = errorData.error.message;
        }
      } catch (e) {
        // If we can't parse the error, use the default message
        console.error('Could not parse TikTok error:', e);
      }
      
      return createPopupResponse('error', provider, errorMessage, baseUrl)
    }

    // Parse the response - TikTok API has inconsistent response formats
    const responseData = await tokenResponse.json()
    console.log('TikTok token response:', responseData)
    
    // Handle both response formats: flat (direct fields) or nested (responseData.data)
    const tokenData = responseData.data || responseData
    
    // Verify we have the required token data
    if (!tokenData.access_token || !tokenData.open_id) {
      console.error('Invalid TikTok token data:', responseData)
      return createPopupResponse('error', provider, 'Invalid token data received from TikTok', baseUrl)
    }
    
    // TikTok access tokens typically expire in 24 hours (86400 seconds)
    const expiresIn = tokenData.expires_in || 86400
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    
    // TikTok refresh tokens are valid for 30 days
    const refreshExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    // Fetch user information
    let userInfo = {
      open_id: tokenData.open_id,
      scope: tokenData.scope,
    }
    
    // Optionally fetch additional user data - UPDATED to use v2 endpoint
    if (tokenData.access_token && tokenData.open_id) {
      try {
        const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          }
        })
        
        if (userResponse.ok) {
          const userData = await userResponse.json()
          if (userData.data) {
            userInfo = {
              ...userInfo,
              ...userData.data
            }
          }
        } else {
          console.warn('Could not fetch TikTok user information:', await userResponse.text())
        }
      } catch (userError) {
        console.warn('Error fetching TikTok user information:', userError)
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
      refresh_token_expires_at: tokenData.refresh_token ? refreshExpiresAt.toISOString() : undefined,
      status: 'connected',
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        open_id: tokenData.open_id,
        user_info: userInfo,
        scope: tokenData.scope
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Failed to save TikTok integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'TikTok connected successfully!', baseUrl)
  } catch (error) {
    console.error('TikTok callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
