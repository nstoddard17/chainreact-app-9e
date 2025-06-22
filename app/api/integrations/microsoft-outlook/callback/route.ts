import { type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")
  const baseUrl = getBaseUrl()
  const provider = "microsoft-outlook"

  if (error) {
    console.error(`Error with Microsoft Outlook OAuth: ${error} - ${errorDescription}`)
    return createPopupResponse('error', provider, errorDescription || `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse('error', provider, 'No code or state provided for Microsoft Outlook OAuth.', baseUrl)
  }

  try {
    const supabaseAdmin = createAdminClient()
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse('error', provider, 'Missing userId in Microsoft Outlook state.', baseUrl)
    }

    const tenant = 'common'
    const tokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    const redirectUri = `${baseUrl}/api/integrations/microsoft-outlook/callback`

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: 'offline_access User.Read Mail.ReadWrite Mail.Send',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Failed to exchange Microsoft Outlook code for token:', errorData)
      return createPopupResponse(
        'error',
        provider,
        errorData.error_description || 'Failed to get Microsoft Outlook access token.',
        baseUrl,
      )
    }

    const tokenData = await tokenResponse.json()
    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    const integrationData = {
      user_id: userId,
      provider: 'microsoft-outlook',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope ? tokenData.scope.split(' ') : [],
      status: 'connected',
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    }

    const { error: dbError } = await supabaseAdmin
      .from('integrations')
      .upsert(integrationData, { onConflict: 'user_id, provider' })

    if (dbError) {
      console.error('Error saving Microsoft Outlook integration to DB:', dbError)
      return createPopupResponse('error', provider, `Database Error: ${dbError.message}`, baseUrl)
    }

    return createPopupResponse('success', provider, 'Microsoft Outlook account connected successfully.', baseUrl)
  } catch (error) {
    console.error('Error during Microsoft Outlook OAuth callback:', error)
    const message = error instanceof Error ? error.message : 'An unexpected error occurred'
    return createPopupResponse('error', provider, message, baseUrl)
  }
}
