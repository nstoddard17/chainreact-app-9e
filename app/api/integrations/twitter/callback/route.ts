import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { prepareIntegrationData } from '@/lib/integrations/tokenUtils'

import { logger } from '@/lib/utils/logger'

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const baseUrl = getBaseUrl()
  const provider = 'twitter'

  if (error) {
    const message = errorDescription || error
    logger.error(`Error with Twitter OAuth: ${message}`)
    return createPopupResponse('error', provider, `OAuth Error: ${message}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Twitter OAuth.', baseUrl)
  }

  try {
    const { data: pkceData, error: pkceError } = await createAdminClient()
      .from('pkce_flow')
      .select('*')
      .eq('state', state)
      .single()

    if (pkceError || !pkceData) {
      throw new Error('Invalid state or PKCE lookup error')
    }

    await createAdminClient().from('pkce_flow').delete().eq('state', state)

    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      throw new Error('Missing userId in Twitter state')
    }

    const clientId = process.env.TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/twitter/callback`

    if (!clientId || !clientSecret) {
      throw new Error('Twitter client ID or secret not configured')
    }

    const tokenEndpoint = 'https://api.twitter.com/2/oauth2/token'
    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`

    const params = new URLSearchParams()
    params.append('code', code)
    params.append('grant_type', 'authorization_code')
    params.append('redirect_uri', redirectUri)
    params.append('code_verifier', pkceData.code_verifier)

    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: authHeader,
      },
      body: params,
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      throw new Error(`Twitter token exchange failed: ${errorText}`)
    }

    const tokenData = await tokenResponse.json()
    const refreshTokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days for refresh token

    // Fetch user information from Twitter
    // API VERIFICATION: Twitter API v2 /users/me endpoint
    // Docs: https://developer.twitter.com/en/docs/twitter-api/users/lookup/api-reference/get-users-me
    // Returns: id, username, name, profile_image_url, etc.
    let userInfo = null
    let email = null
    let username = null
    let name = null
    let profileImageUrl = null

    try {
      const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=username,name,profile_image_url', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      })

      if (userResponse.ok) {
        const userData = await userResponse.json()
        userInfo = userData.data
        username = userInfo?.username || null
        name = userInfo?.name || null
        profileImageUrl = userInfo?.profile_image_url || null
      }
    } catch (userError) {
      logger.warn('Failed to fetch Twitter user info:', userError)
    }

    const integrationData = await prepareIntegrationData(
      userId,
      provider,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.scope ? tokenData.scope.split(' ') : [],
      tokenData.expires_in,
      refreshTokenExpiresAt
    )

    // Add top-level account identity fields
    integrationData.email = email || null
    integrationData.username = username || null
    integrationData.account_name = name || username || null
    integrationData.avatar_url = profileImageUrl || null

    // Add user info to metadata for additional context
    integrationData.metadata = {
      ...(integrationData.metadata || {}),
      user_info: userInfo,
      // Keep in metadata for backward compatibility
      email: email || null,
      username: username || null,
      account_name: name || username || null,
      profile_image_url: profileImageUrl || null
    }

    const supabase = createAdminClient()
    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      throw new Error(`Failed to save Twitter integration: ${upsertError.message}`)
    }

    return createPopupResponse('success', provider, 'You can now close this window.', baseUrl)
  } catch (e: any) {
    logger.error('Twitter callback error:', e)
    return createPopupResponse('error', provider, e.message || 'An unexpected error occurred.', baseUrl)
  }
}
