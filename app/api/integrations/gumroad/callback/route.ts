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
  const provider = 'gumroad'

  // Handle OAuth errors
  if (error) {
    logger.error(`Gumroad OAuth error: ${error} - ${errorDescription}`)
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

    // Get Gumroad OAuth credentials
    const clientId = process.env.GUMROAD_CLIENT_ID
    const clientSecret = process.env.GUMROAD_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/gumroad/callback`

    if (!clientId || !clientSecret) {
      logger.error('Gumroad OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    // Gumroad API endpoint for token exchange
    const tokenEndpoint = 'https://api.gumroad.com/oauth/token'
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      logger.error('Gumroad token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenjsonResponse()
    
    // Gumroad access tokens don't expire by default
    // We'll set a nominal expiration for safety
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
    
    // Fetch user profile info
    let profileData = {}
    if (tokenData.access_token) {
      try {
        const meResponse = await fetch('https://api.gumroad.com/v2/user', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`
          }
        })
        
        if (meResponse.ok) {
          const meData = await mejsonResponse()
          if (meData.success && meData.user) {
            profileData = {
              name: meData.user.name,
              email: meData.user.email,
              bio: meData.user.bio,
              user_id: meData.user.user_id,
              twitter_handle: meData.user.twitter_handle
            }
          }
        } else {
          logger.warn('Failed to fetch Gumroad user profile:', await meResponse.text())
        }
      } catch (profileError) {
        logger.warn('Error fetching Gumroad profile:', profileError)
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
      refresh_token: null, // Gumroad doesn't provide refresh tokens
      expires_at: expiresAt.toISOString(),
      status: 'connected',
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        profile: profileData,
        token_type: tokenData.token_type
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      logger.error('Failed to save Gumroad integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'Gumroad connected successfully!', baseUrl)
  } catch (error) {
    logger.error('Gumroad callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
