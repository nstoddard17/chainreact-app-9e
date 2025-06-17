import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

// Create a Supabase client with admin privileges
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

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
  console.log("Google Sheets OAuth callback received")
  const baseUrl = getBaseUrl()

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      const errorDescription =
        searchParams.get("error_description") || "An unknown error occurred."
      console.error("Google Sheets OAuth error:", error, errorDescription)
      return createPopupResponse(
        "error",
        "google-sheets",
        `${error}: ${errorDescription}`,
        baseUrl,
      )
    }

    if (!code || !state) {
      console.error("Missing code or state in Google Sheets callback")
      return createPopupResponse(
        "error",
        "google-sheets",
        "Authorization code or state is missing.",
        baseUrl,
      )
    }

    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Invalid state parameter in Google Sheets callback:", e)
      return createPopupResponse(
        "error",
        "google-sheets",
        "Invalid state parameter.",
        baseUrl,
      )
    }

    const { userId } = stateData
    if (!userId) {
      console.error("Missing userId in Google Sheets state")
      return createPopupResponse(
        "error",
        "google-sheets",
        "User ID is missing from state.",
        baseUrl,
      )
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${baseUrl}/api/integrations/google-sheets/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Google Sheets token exchange failed:", errorText)
      let errorDescription = "Could not get access token from Google."
      try {
        const errorJson = JSON.parse(errorText)
        errorDescription = errorJson.error_description || errorJson.error || errorDescription
      } catch (e) {
        if (errorText.length < 200) {
          errorDescription = errorText
        }
      }
      return createPopupResponse(
        "error",
        "google-sheets",
        `Token exchange failed: ${errorDescription}`,
        baseUrl,
      )
    }

    const tokens = await tokenResponse.json()

    // Get user info from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to get Google Sheets user info")
      return createPopupResponse(
        "error",
        "google-sheets",
        "Could not fetch user information from Google.",
        baseUrl,
      )
    }

    const userInfo = await userInfoResponse.json()

    const integrationData = {
      user_id: userId,
      provider: "google-sheets",
      status: "connected",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope.split(" "),
      provider_user_id: userInfo.id,
      metadata: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
      },
    }

    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(integrationData, { onConflict: "user_id, provider" })

    if (upsertError) {
      console.error("Error saving Google Sheets integration to DB:", upsertError)
      return createPopupResponse(
        "error",
        "google-sheets",
        `Database error: ${upsertError.message}`,
        baseUrl,
      )
    }

    return createPopupResponse(
      "success",
      "google-sheets",
      "Your Google Sheets account has been successfully connected.",
      baseUrl,
    )
  } catch (error: any) {
    console.error("Google Sheets callback error:", error)
    const errorMessage = error.message || "An unexpected error occurred."
    return createPopupResponse("error", "google-sheets", errorMessage, baseUrl)
  }
}
