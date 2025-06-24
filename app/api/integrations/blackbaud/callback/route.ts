import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

interface BlackbaudTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  
  const baseUrl = getBaseUrl()
  const provider = 'blackbaud'

  // Handle OAuth errors
  if (error) {
    console.error(`Blackbaud OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || 'Authorization failed', baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'Missing code or state parameter', baseUrl)
  }

  try {
    // Verify state parameter to prevent CSRF
    const { data: pkceData, error: pkceError } = await createAdminClient()
      .from('oauth_pkce_state')
      .select('*')
      .eq('state', state)
      .single()

    if (pkceError || !pkceData) {
      console.error('Invalid state or PKCE lookup error:', pkceError)
      return createPopupResponse('error', provider, 'Invalid state parameter', baseUrl)
    }

    const userId = pkceData.user_id
    
    if (!userId) {
      return createPopupResponse('error', provider, 'User ID not found', baseUrl)
    }

    // Clean up the state
    await createAdminClient()
      .from('oauth_pkce_state')
      .delete()
      .eq('state', state)

    // Get Blackbaud OAuth credentials
    const clientId = process.env.NEXT_PUBLIC_BLACKBAUD_CLIENT_ID
    const clientSecret = process.env.BLACKBAUD_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/blackbaud/callback`

    if (!clientId || !clientSecret) {
      console.error('Blackbaud OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    const tokenEndpoint = 'https://oauth2.sky.blackbaud.com/token'
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Blackbaud token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData: BlackbaudTokenResponse = await tokenResponse.json()
    
    // Extract and handle token expiration
    const expiresIn = tokenData.expires_in || 3600 // Default to 1 hour if not provided
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    
    // Blackbaud refresh tokens are typically valid for 60 days
    const refreshExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)

    // Fetch subscription key if available
    let subscriptionKey = null
    try {
      const { data: configData } = await createAdminClient()
        .from('integration_configs')
        .select('config')
        .eq('provider', provider)
        .single()
        
      subscriptionKey = configData?.config?.subscription_key
    } catch (configError) {
      console.warn('Could not fetch Blackbaud subscription key:', configError)
    }

    // Optional: Fetch additional account data
    let accountInfo = {}
    
    if (tokenData.access_token && subscriptionKey) {
      try {
        const meResponse = await fetch('https://api.sky.blackbaud.com/users/v1/me', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'bb-api-subscription-key': subscriptionKey
          }
        })
        
        if (meResponse.ok) {
          accountInfo = await meResponse.json()
        } else {
          console.warn('Could not fetch Blackbaud user info:', await meResponse.text())
        }
      } catch (accountError) {
        console.warn('Error fetching Blackbaud user info:', accountError)
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
        account_info: accountInfo,
        subscription_key: subscriptionKey,
        token_type: tokenData.token_type
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Failed to save Blackbaud integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'Blackbaud connected successfully!', baseUrl)
  } catch (error) {
    console.error('Blackbaud callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
