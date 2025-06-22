import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')

  const baseUrl = getBaseUrl()
  const provider = 'box'

  if (error) {
    console.error(`Box OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse(
      'error',
      provider,
      errorDescription || 'An unknown error occurred.',
      baseUrl,
    )
  }

  if (!code || !state) {
    console.error('Missing code or state in Box callback')
    return createPopupResponse(
      'error',
      provider,
      'Authorization code or state parameter is missing.',
      baseUrl,
    )
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      throw new Error('Missing userId in Box state')
    }

    const supabase = createAdminClient()

    const clientId = process.env.NEXT_PUBLIC_BOX_CLIENT_ID
    const clientSecret = process.env.BOX_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/box/callback`

    if (!clientId || !clientSecret) {
      throw new Error('Box client ID or secret not configured')
    }

    const tokenResponse = await fetch('https://api.box.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Box token exchange error response:', errorData)
      throw new Error(`Box token exchange failed: ${errorData.error_description || errorData.error || 'Unknown error'}`)
    }

    const tokenData = await tokenResponse.json()

    const expiresIn = tokenData.expires_in // Typically in seconds
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Upsert the integration details
    const integrationData = {
      user_id: userId,
      provider: provider,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      status: 'connected',
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      throw new Error(`Failed to save Box integration: ${upsertError.message}`)
    }

    return createPopupResponse('success', provider, 'You can now close this window.', baseUrl)
  } catch (e: any) {
    console.error('Box callback error:', e)
    return createPopupResponse(
      'error',
      provider,
      e.message || 'An unexpected error occurred.',
      baseUrl,
    )
  }
}
