import { type NextRequest } from "next/server"
import supabaseAdmin from "@/lib/supabase/admin"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

function createTrelloInitialPage(baseUrl: string) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Connecting to Trello...</title>
        <script>
          // The Trello token is in the URL hash, so we need to parse it from there.
          const hash = window.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const token = params.get('token');
          const state = params.get('state');

          if (token && state) {
              // Forward the token and state to the server-side callback as query params
              const serverCallbackUrl = new URL('${baseUrl}/api/integrations/trello/callback');
              serverCallbackUrl.searchParams.set('token', token);
              serverCallbackUrl.searchParams.set('state', state);
              window.location.href = serverCallbackUrl.href;
          } else if (window.opener) {
              window.opener.postMessage({
                  type: 'oauth-error',
                  provider: 'trello',
                  message: 'Trello authentication failed. Token not found.'
              }, '${baseUrl}');
              setTimeout(() => window.close(), 1000);
          }
        </script>
      </head>
      <body>
        <p>Please wait, connecting to Trello...</p>
      </body>
    </html>
  `
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html" } })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const baseUrl = getBaseUrl()
  const provider = "trello"

  if (error) {
    console.error(`Trello OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse("error", provider, errorDescription || "An unknown error occurred.", baseUrl)
  }

  // If token and state are missing, it's the initial call from Trello.
  // We return a page with JS to extract them from the URL hash and redirect.
  if (!token || !state) {
    return createTrelloInitialPage(baseUrl)
  }

  // This part of the code now runs after the client-side script has extracted the token and state
  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      throw new Error("Missing userId in Trello state")
    }

    const accessToken = token

    const integrationData = {
      user_id: userId,
      provider: "trello",
      access_token: accessToken,
      refresh_token: null, // Trello doesn't provide a refresh token in this flow
      expiresAt: null, // Trello tokens don't expire unless manually revoked
      scopes: [], // Trello doesn't provide scopes in this flow
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabaseAdmin.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Trello integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", provider, "Successfully connected to Trello.", baseUrl)
  } catch (e: any) {
    console.error("Trello callback error:", e)
    return createPopupResponse("error", provider, e.message || "An unexpected error occurred.", baseUrl)
  }
}
