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
  const baseUrl = getBaseUrl()
  const provider = 'docker'

  if (error) {
    console.error(`Error with Docker OAuth: ${error}`)
    return createPopupResponse('error', provider, `OAuth Error: ${error}`, baseUrl)
  }

  if (!code) {
    return createPopupResponse('error', provider, 'No code provided for Docker OAuth.', baseUrl)
  }

  if (!state) {
    return createPopupResponse('error', provider, 'No state provided for Docker OAuth.', baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in Docker state.', baseUrl)
    }

    const response = await fetch('https://hub.docker.com/v2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID!,
        client_secret: process.env.DOCKER_CLIENT_SECRET!,
        redirect_uri: `${baseUrl}/api/integrations/docker/callback`,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Failed to exchange Docker code for token:', errorData)
      return createPopupResponse('error', provider, 'Failed to get Docker access token.', baseUrl)
    }

    const tokens = await response.json()
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token

    const expiresIn = tokens.expires_in // Typically in seconds
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    const { error: dbError } = await supabaseAdmin.from('integrations').upsert(
      {
        user_id: userId,
        provider: 'docker',
        access_token: accessToken,
        refresh_token: refreshToken,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        scopes: tokens.scope ? tokens.scope.split(' ') : null,
        status: 'connected',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id, provider' },
    )

    if (dbError) {
      console.error('Error saving Docker integration to DB:', dbError)
      return createPopupResponse(
        'error',
        provider,
        `Database Error: ${dbError.message}`,
        baseUrl,
      )
    }

    return createPopupResponse(
      'success',
      provider,
      'Docker account connected successfully.',
      baseUrl,
    )
  } catch (error) {
    console.error('Error during Docker OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
