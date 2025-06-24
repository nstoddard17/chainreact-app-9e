import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { encrypt } from '@/lib/security/encryption'

interface InstagramProfile {
  id?: string;
  username?: string;
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

    // Get Instagram OAuth credentials
    const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/instagram/callback`

    if (!clientId || !clientSecret) {
      console.error('Instagram OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    // Instagram uses Facebook's OAuth API for token exchange
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
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Instagram token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    
    // Instagram tokens are typically long-lived (60 days)
    // Default to 60 days if not specified
    const expiresIn = tokenData.expires_in || 60 * 24 * 60 * 60
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // Get user info to store additional details
    let profileData: InstagramProfile = {}
    
    try {
      const profileResponse = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${tokenData.access_token}`)
      if (profileResponse.ok) {
        profileData = await profileResponse.json() as InstagramProfile
      } else {
        console.warn('Could not fetch Instagram profile:', await profileResponse.text())
      }
    } catch (profileError) {
      console.warn('Error fetching Instagram profile:', profileError)
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
      refresh_token: null, // Instagram basic display API doesn't provide refresh tokens
      expires_at: expiresAt.toISOString(),
      status: 'connected',
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        user_id: tokenData.user_id || profileData.id,
        username: profileData.username
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Failed to save Instagram integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'Instagram connected successfully!', baseUrl)
  } catch (error) {
    console.error('Instagram callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
