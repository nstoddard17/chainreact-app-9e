import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export const maxDuration = 30

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
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`Error with Gmail OAuth: ${error}`)
    return createPopupResponse("error", "gmail", `OAuth Error: ${error}`, baseUrl)
  }

  if (!code) {
    return createPopupResponse("error", "gmail", "No code provided for Gmail OAuth.", baseUrl)
  }

  if (!state) {
    return createPopupResponse("error", "gmail", "No state provided for Gmail OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse("error", "gmail", "Missing userId in Gmail state.", baseUrl)
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Google Client ID or Client Secret environment variables.")
      return createPopupResponse(
        "error",
        "gmail",
        "Server configuration error for Gmail OAuth.",
        baseUrl,
      )
    }

    let tokens
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${baseUrl}/api/integrations/gmail/callback`,
          grant_type: "authorization_code",
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        let errorData
        try {
          errorData = JSON.parse(errorText)
        } catch (e) {
          errorData = { error: "unknown_error", error_description: errorText }
        }
        const errorMessage = `Google Auth Error: ${
          errorData.error_description || errorData.error || "Unknown error"
        }`
        console.error("Failed to exchange Gmail code for token:", JSON.stringify(errorData, null, 2))
        return createPopupResponse("error", "gmail", errorMessage, baseUrl)
      }
      tokens = await response.json()
    } catch (fetchError: any) {
      console.error("Error fetching Google token:", fetchError)
      return createPopupResponse("error", "gmail", `Token fetch failed: ${fetchError.message}`, baseUrl)
    }

    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch Gmail user info")
      return createPopupResponse("error", "gmail", "Failed to fetch Gmail user info.", baseUrl)
    }

    const userInfo = await userInfoResponse.json()
    const providerAccountId = userInfo.id

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { error: dbError } = await supabase.from("integrations").upsert(
      {
        user_id: userId,
        provider: "gmail",
        provider_user_id: providerAccountId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scopes: tokens.scope.split(" "),
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (dbError) {
      console.error("Error saving Gmail integration to DB:", dbError)
      return createPopupResponse(
        "error",
        "gmail",
        `Database Error: ${dbError.message}`,
        baseUrl,
      )
    }

    return createPopupResponse(
      "success",
      "gmail",
      "Gmail account connected successfully.",
      baseUrl,
    )
  } catch (error) {
    console.error("Error during Gmail OAuth callback:", error)
    const message = error instanceof Error ? error.message : "An unexpected error occurred"
    return createPopupResponse("error", "gmail", message, baseUrl)
  }
}
