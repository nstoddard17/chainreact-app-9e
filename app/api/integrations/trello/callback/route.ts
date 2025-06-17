import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

function createPopupResponse(
  type: "success" | "error",
  provider: string,
  message: string,
  baseUrl: string,
) {
  const title = type === "success" ? `${provider} Connection Successful` : `${provider} Connection Failed`
  const header = type === "success" ? `${provider} Connected!` : `Error Connecting ${provider}`
  const status = type === "success" ? 200 : 500
  const script = `
    <script>
      if (window.opener) {
        window.opener.postMessage({
            type: 'oauth-${type}',
            provider: '${provider}',
            message: '${message}'
        }, '${baseUrl}');
        setTimeout(() => window.close(), 500);
      } else {
         document.getElementById('message').innerText = 'Something went wrong. Please close this window and try again.';
      }
    </script>
  `
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; 
            align-items: center; 
            justify-content: center; 
            height: 100vh; 
            margin: 0;
            background: ${type === "success" ? "linear-gradient(135deg, #24c6dc 0%, #514a9d 100%)" : "linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%)"};
            color: white;
          }
          .container { 
            text-align: center; 
            padding: 2rem;
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            backdrop-filter: blur(10px);
          }
          .icon { font-size: 3rem; margin-bottom: 1rem; }
          h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
          p { margin: 0.5rem 0; opacity: 0.9; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">${type === "success" ? "✅" : "❌"}</div>
          <h1 id="header">${header}</h1>
          <p id="message">${message}</p>
          <p>This window will close automatically...</p>
        </div>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}

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

  if (error) {
    console.error(`Trello OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse(
      "error",
      "trello",
      errorDescription || "An unknown error occurred.",
      baseUrl,
    )
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

    // Trello gives the access token directly
    const accessToken = token

    // Get user info
    const userResponse = await fetch(
      `https://api.trello.com/1/members/me?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
    )

    if (!userResponse.ok) {
      const errorBody = await userResponse.text()
      console.error("Failed to get Trello user info:", errorBody)
      throw new Error(`Failed to get Trello user info. Status: ${userResponse.status}`)
    }

    const userData = await userResponse.json()

    const integrationData = {
      user_id: userId,
      provider: "trello",
      provider_user_id: userData.id,
      access_token: accessToken,
      refresh_token: null, // Trello doesn't provide a refresh token in this flow
      expires_at: null, // Trello tokens don't expire unless manually revoked
      scopes: [], // Trello doesn't provide scopes in this flow
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Trello integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", "trello", "Successfully connected to Trello.", baseUrl)
  } catch (e: any) {
    console.error("Trello callback error:", e)
    return createPopupResponse("error", "trello", e.message || "An unexpected error occurred.", baseUrl)
  }
}
