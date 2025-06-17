import { type NextRequest } from 'next/server'
import supabaseAdmin from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.search_params.get("state")
  const error = url.search_params.get("error")
  const errorDescription = url.search_params.get("error_description")
  const baseUrl = getBaseUrl()
  const provider = 'onedrive'

  if (error) {
    console.error(`Error with OneDrive OAuth: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for OneDrive OAuth.', baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in OneDrive state.', baseUrl)
    }

    const tenant = 'common'
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    const redirectUri = `${baseUrl}/api/integrations/onedrive/callback`

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID!,
        client_secret: process.env.ONEDRIVE_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'offline_access files.readwrite.all',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Failed to exchange OneDrive code for token:', errorData)
      return createPopupResponse(
        'error',
        provider,
        errorData.error_description || 'Failed to get OneDrive access token.',
        baseUrl,
      )
    }

    const tokenData = await tokenResponse.json()
    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    const integrationData = {
      user_id: userId,
      provider: provider,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope.split(' '),
      status: 'connected',
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { error: dbError } = await supabaseAdmin
      .from('integrations')
      .upsert(integrationData, { onConflict: 'user_id, provider' })

    if (dbError) {
      console.error('Error saving OneDrive integration to DB:', dbError)
      return createPopupResponse('error', provider, `Database Error: ${dbError.message}`, baseUrl)
    }

    return createPopupResponse('success', provider, 'OneDrive account connected successfully.', baseUrl)
  } catch (error) {
    console.error('Error during OneDrive OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
