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
  const provider = 'globalpayments'

  // Handle OAuth errors
  if (error) {
    console.error(`GlobalPayments OAuth error: ${error} - ${errorDescription}`)
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

    // Get GlobalPayments OAuth credentials
    const clientId = process.env.GLOBALPAYMENTS_CLIENT_ID
    const clientSecret = process.env.GLOBALPAYMENTS_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/globalpayments/callback`

    if (!clientId || !clientSecret) {
      console.error('GlobalPayments OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    // GlobalPayments OAuth token endpoint
    const tokenEndpoint = 'https://apis.globalpay.com/ucp/oauth2/token'
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('GlobalPayments token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    
    // Extract and handle token expiration
    const expiresIn = tokenData.expires_in || 3600 // Default to 1 hour
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    const refreshExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days default

    // Fetch account info if possible to store additional data
    let accountData = {}
    
    if (tokenData.access_token) {
      try {
        const accountResponse = await fetch('https://apis.globalpay.com/ucp/accounts', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`
          }
        })
        
        if (accountResponse.ok) {
          accountData = await accountResponse.json()
        } else {
          console.warn('Could not fetch GlobalPayments account data:', await accountResponse.text())
        }
      } catch (accountError) {
        console.warn('Error fetching GlobalPayments account data:', accountError)
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
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      updated_at: new Date().toISOString(),
      metadata: {
        account_info: accountData,
        token_type: tokenData.token_type
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Failed to save GlobalPayments integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'GlobalPayments connected successfully!', baseUrl)
  } catch (error) {
    console.error('GlobalPayments callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
