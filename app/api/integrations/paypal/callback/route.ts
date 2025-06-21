import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  const baseUrl = getBaseUrl()
  const provider = 'paypal'

  if (error) {
    console.error(`Error with PayPal OAuth: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for PayPal OAuth.', baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      throw new Error('Missing userId in PayPal state')
    }

    const supabase = createAdminClient()

    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/paypal/callback`

    if (!clientId || !clientSecret) {
      throw new Error('PayPal client ID or secret not configured')
    }

    const tokenResponse = await fetch('https://api.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`PayPal token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    const expiresIn = tokenData.expires_in
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
      throw new Error(`Failed to save PayPal integration: ${upsertError.message}`)
    }

    return createPopupResponse('success', provider, 'You can now close this window.', baseUrl)
  } catch (e: any) {
    console.error('PayPal callback error:', e)
    return createPopupResponse(
      'error',
      provider,
      e.message || 'An unexpected error occurred.',
      baseUrl,
    )
  }
}
