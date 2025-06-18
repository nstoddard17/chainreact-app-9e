import { type NextRequest } from 'next/server'
import supabaseAdmin from '@/lib/supabase/admin'
import { createPopupResponse } from '@/lib/utils/createPopupResponse'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const baseUrl = getBaseUrl()
  const provider = 'gitlab'

  if (error) {
    console.error(`Error with GitLab OAuth: ${error}`)
    return createPopupResponse('error', provider, `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for GitLab OAuth.', baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in GitLab state.', baseUrl)
    }

    const redirectUri = `${baseUrl}/api/integrations/gitlab/callback`
    const response = await fetch('https://gitlab.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID!,
        client_secret: process.env.GITLAB_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Failed to exchange GitLab code for token:', errorData)
      return createPopupResponse(
        'error',
        provider,
        errorData.error_description || 'Failed to get GitLab access token.',
        baseUrl,
      )
    }

    const tokenData = await response.json()

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    const integrationData = {
      user_id: userId,
      provider: 'gitlab',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: tokenData.scope.split(' '),
      status: 'connected',
      updated_at: new Date().toISOString(),
    }

    const { error: dbError } = await supabaseAdmin
      .from('integrations')
      .upsert(integrationData, { onConflict: 'user_id, provider' })

    if (dbError) {
      console.error('Error saving GitLab integration to DB:', dbError)
      return createPopupResponse('error', provider, `Database Error: ${dbError.message}`, baseUrl)
    }

    return createPopupResponse('success', provider, 'GitLab account connected successfully.', baseUrl)
  } catch (error) {
    console.error('Error during GitLab OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
