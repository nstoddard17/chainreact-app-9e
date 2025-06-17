import { type NextRequest, NextResponse } from "next/server"
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
      }
      setTimeout(() => window.close(), 1000);
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
          <h1>${header}</h1>
          <p>${message}</p>
          <p>This window will close automatically...</p>
        </div>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { status, headers: { "Content-Type": "text/html" } })
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`OneDrive OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse(
      "error",
      "onedrive",
      errorDescription || "An unknown error occurred.",
      baseUrl,
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in OneDrive callback")
    return createPopupResponse(
      "error",
      "onedrive",
      "Authorization code or state parameter is missing.",
      baseUrl,
    )
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      console.error("Missing userId in OneDrive state")
      return createPopupResponse("error", "onedrive", "User ID is missing from state", baseUrl)
    }

    const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("OneDrive client ID or secret not configured")
    }

    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${baseUrl}/api/integrations/onedrive/callback`,
        }),
      },
    )

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`OneDrive token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    // Get user info
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error("Failed to get OneDrive user info")
    }

    const userData = await userResponse.json()

    const integrationData = {
      user_id: userId,
      provider: "onedrive",
      provider_user_id: userData.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
        : null,
      scopes: tokenData.scope.split(" "),
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(integrationData, {
        onConflict: "user_id, provider",
      })

    if (upsertError) {
      throw new Error(`Failed to save OneDrive integration: ${upsertError.message}`)
    }

    return createPopupResponse(
      "success",
      "onedrive",
      "OneDrive account connected successfully.",
      baseUrl,
    )
  } catch (e: any) {
    console.error("OneDrive callback error:", e)
    return createPopupResponse(
      "error",
      "onedrive",
      e.message || "An unexpected error occurred.",
      baseUrl,
    )
  }
}
