import { type NextRequest } from 'next/server'
import supabaseAdmin from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

// Validate environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')
  const baseUrl = getBaseUrl()
  const provider = 'facebook'

  if (error) {
    console.error(`Error with Facebook OAuth: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Facebook OAuth.', baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in Facebook state.', baseUrl)
    }

    const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID!
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET!
    const redirectUri = `${baseUrl}/api/integrations/facebook/callback`

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${redirectUri}&client_secret=${clientSecret}&code=${code}`,
    )

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Failed to exchange Facebook code for token:', errorData)
      return createPopupResponse(
        'error',
        provider,
        errorData.error?.message || 'Failed to get Facebook access token.',
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
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      status: 'connected',
      updated_at: new Date().toISOString(),
    }

    const { error: dbError } = await supabaseAdmin
      .from('integrations')
      .upsert(integrationData, { onConflict: 'user_id, provider' })

    if (dbError) {
      console.error('Error saving Facebook integration to DB:', dbError)
      return createPopupResponse('error', provider, `Database Error: ${dbError.message}`, baseUrl)
    }

    return createPopupResponse('success', provider, 'Facebook account connected successfully.', baseUrl)
  } catch (error) {
    console.error('Error during Facebook OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
