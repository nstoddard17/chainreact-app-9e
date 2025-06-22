import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { prepareIntegrationData } from '@/lib/integrations/tokenUtils'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  const baseUrl = getBaseUrl()
  const provider = 'twitter'

  if (error) {
    const message = errorDescription || error
    console.error(`Error with Twitter OAuth: ${message}`)
    return createPopupResponse('error', provider, `OAuth Error: ${message}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Twitter OAuth.', baseUrl)
  }

  try {
    // Fetch the code_verifier from the database
    const { data: pkceData, error: pkceError } = await createAdminClient()
      .from("pkce_flow")
      .select("code_verifier, state")
      .eq("state", state)
      .eq("provider", "twitter")
      .single();

    if (pkceError || !pkceData) {
      return createPopupResponse('error', provider, `Failed to retrieve PKCE data: ${pkceError?.message || 'Not found'}`, baseUrl);
    }

    const { code_verifier } = pkceData;
    const stateData = JSON.parse(atob(pkceData.state));
    const { userId } = stateData;
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in Twitter state.', baseUrl);
    }

    const supabase = createAdminClient()

    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/twitter/callback`

    if (!clientId || !clientSecret) {
      throw new Error('Twitter client ID or secret not configured')
    }

    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: code_verifier, // PKCE support
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Twitter token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    // Prepare integration data with encrypted tokens
    const integrationData = await prepareIntegrationData(
      userId,
      provider,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.scope ? tokenData.scope.split(' ') : [],
      tokenData.expires_in
    )

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      throw new Error(`Failed to save Twitter integration: ${upsertError.message}`)
    }

    return createPopupResponse('success', provider, 'You can now close this window.', baseUrl)
  } catch (e: any) {
    console.error('Twitter callback error:', e)
    return createPopupResponse(
      'error',
      provider,
      e.message || 'An unexpected error occurred.',
      baseUrl,
    )
  }
}
