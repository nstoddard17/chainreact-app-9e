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
  const provider = 'linkedin'

  // Handle OAuth errors
  if (error) {
    logger.error(`LinkedIn OAuth error: ${error} - ${errorDescription}`)
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

    // Get LinkedIn OAuth credentials
    const clientId = process.env.LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/linkedin/callback`

    if (!clientId || !clientSecret) {
      logger.error('LinkedIn OAuth credentials not configured')
      return createPopupResponse('error', provider, 'Integration configuration error', baseUrl)
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
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
      logger.error('LinkedIn token exchange failed:', tokenResponse.status, errorText)
      return createPopupResponse('error', provider, 'Failed to retrieve access token', baseUrl)
    }

    const tokenData = await tokenResponse.json()
    
    // LinkedIn tokens typically expire in 60 days (5184000 seconds)
    const expiresIn = tokenData.expires_in || 5184000
    const expiresAt = new Date(Date.now() + expiresIn * 1000)

    // Fetch user profile to get additional data
    const profileResponse = await fetch('https://api.linkedin.com/v2/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!profileResponse.ok) {
      logger.error('Failed to fetch LinkedIn profile:', await profileResponse.text())
    }

    const profileData = profileResponse.ok ? await profileResponse.json() : {}

    // Fetch email address
    let emailAddress = null
    try {
      const emailResponse = await fetch('https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      })

      if (emailResponse.ok) {
        const emailData = await emailResponse.json()
        if (emailData.elements && emailData.elements.length > 0) {
          emailAddress = emailData.elements[0]['handle~']?.emailAddress
        }
      }
    } catch (emailError) {
      logger.warn('Failed to fetch LinkedIn email:', emailError)
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
      refresh_token: tokenData.refresh_token ? encrypt(tokenData.refresh_token, encryptionKey) : null, // LinkedIn may not provide refresh tokens
      expires_at: expiresAt.toISOString(),
      status: 'connected',
      is_active: true,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      updated_at: new Date().toISOString(),
      email: emailAddress || null,
      username: profileData.localizedFirstName && profileData.localizedLastName
        ? `${profileData.localizedFirstName} ${profileData.localizedLastName}`
        : null,
      account_name: profileData.localizedFirstName && profileData.localizedLastName
        ? `${profileData.localizedFirstName} ${profileData.localizedLastName}`
        : null,
      metadata: {
        profile_id: profileData.id,
        name: profileData.localizedFirstName && profileData.localizedLastName
          ? `${profileData.localizedFirstName} ${profileData.localizedLastName}`
          : undefined
      }
    }, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      logger.error('Failed to save LinkedIn integration:', upsertError)
      return createPopupResponse('error', provider, 'Failed to store integration data', baseUrl)
    }

    return createPopupResponse('success', provider, 'LinkedIn connected successfully!', baseUrl)
  } catch (error) {
    logger.error('LinkedIn callback error:', error)
    return createPopupResponse('error', provider, 'An unexpected error occurred', baseUrl)
  }
}
