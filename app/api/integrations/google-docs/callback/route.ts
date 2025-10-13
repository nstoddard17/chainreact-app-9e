import { type NextRequest } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
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
  const provider = 'google-docs'

  if (error) {
    logger.error(`Error with Google Docs OAuth: ${error}`)
    return createPopupResponse('error', provider, `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Google Docs OAuth.', baseUrl)
  }

  try {
    const stateObject = JSON.parse(atob(state))
    const { userId, provider: stateProvider, reconnect, integrationId } = stateObject
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in Google Docs state.', baseUrl)
    }

    const supabase = createAdminClient()

    const clientId = process.env.GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    const redirectUri = `${baseUrl}/api/integrations/google-docs/callback`
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: '',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenjsonResponse()
      logger.error('Failed to exchange Google Docs code for token:', errorData)
      return createPopupResponse(
        'error',
        provider,
        errorData.error_description || 'Failed to get Google Docs access token.',
        baseUrl,
      )
    }

    const tokenData = await tokenjsonResponse()

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    const integrationData = {
      user_id: userId,
      provider: 'google-docs',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: tokenData.scope.split(' '),
      status: 'connected',
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      logger.error('Error saving Google Docs integration to DB:', upsertError)
      return createPopupResponse('error', provider, `Database Error: ${upsertError.message}`, baseUrl)
    }

    return createPopupResponse('success', provider, 'Google Docs account connected successfully.', baseUrl)
  } catch (error) {
    logger.error('Error during Google Docs OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
