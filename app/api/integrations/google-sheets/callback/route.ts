import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const baseUrl = getBaseUrl()
  const provider = 'google-sheets'

  if (error) {
    logger.error(`Error with Google Sheets OAuth: ${error}`)
    return createPopupResponse('error', provider, `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Google Sheets OAuth.', baseUrl)
  }

  try {
    const stateObject = JSON.parse(atob(state))
    const { userId, provider: stateProvider, reconnect, integrationId } = stateObject
    if (!userId) {
      throw new Error('Missing userId in Google Sheets state')
    }

    const supabase = createAdminClient()

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/google-sheets/callback`

    if (!clientId || !clientSecret) {
      throw new Error('Google client ID or secret not configured')
    }

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
      const errorData = await tokenResponse.json()
      throw new Error(`Google token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    const expiresIn = tokenData.expires_in // Typically 3600 seconds
    const expiresAt = new Date(new Date().getTime() + expiresIn * 1000)

    // Upsert the integration details
    const integrationData = {
      user_id: userId,
      provider: provider,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      status: 'connected',
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      throw new Error(`Failed to save Google Sheets integration: ${upsertError.message}`)
    }

    return createPopupResponse('success', provider, 'You can now close this window.', baseUrl)
  } catch (e: any) {
    logger.error('Google Sheets callback error:', e)
    return createPopupResponse(
      'error',
      provider,
      e.message || 'An unexpected error occurred.',
      baseUrl,
    )
  }
}
