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
  const provider = 'youtube-studio'

  // Handle OAuth errors
  if (error) {
    console.error(`YouTube Studio OAuth error: ${error} - ${errorDescription}`)
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

    // Get YouTube Studio (Google) OAuth credentials
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/youtube-studio/callback`

    if (!clientId || !clientSecret) {
      console.error('Google OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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
      const errorText = await tokenResponse.text()
      console.error('YouTube Studio token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    
    // Extract and handle token expiration
    const expiresIn = tokenData.expires_in || 3600 // Default to 1 hour if not provided
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    
    // Google refresh tokens don't expire unless revoked or not used for 6 months
    // We'll set a nominal expiration of 6 months
    const refreshExpiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)

    // Get user's channel information
    let channelInfo = {}
    if (tokenData.access_token) {
      try {
        // Get user's YouTube channel information
        const youtubeResponse = await fetch(
          'https://youtube.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
          {
            headers: {
              Authorization: `Bearer ${tokenData.access_token}`,
            },
          }
        )

        if (youtubeResponse.ok) {
          const youtubeData = await youtubeResponse.json()
          if (youtubeData.items && youtubeData.items.length > 0) {
            const channel = youtubeData.items[0]
            channelInfo = {
              id: channel.id,
              title: channel.snippet.title,
              thumbnail: channel.snippet.thumbnails?.default?.url,
            }
          }
        } else {
          console.warn('Failed to fetch YouTube channel:', await youtubeResponse.text())
        }
      } catch (profileError) {
        console.warn('Error fetching YouTube channel:', profileError)
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
        channel_info: channelInfo,
        token_type: tokenData.token_type
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      console.error('Failed to save YouTube Studio integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'YouTube Studio connected successfully!', baseUrl)
  } catch (error) {
    console.error('YouTube Studio callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
