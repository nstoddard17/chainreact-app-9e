import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

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
    console.error(`Error with GitHub OAuth: ${error}`)
    return createPopupResponse("error", "github", `OAuth Error: ${error}`, baseUrl)
  }

  if (!code) {
    return createPopupResponse("error", "github", "No code provided for GitHub OAuth.", baseUrl)
  }

  if (!state) {
    return createPopupResponse("error", "github", "No state provided for GitHub OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse("error", "github", "Missing userId in GitHub state.", baseUrl)
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code,
        redirect_uri: `${baseUrl}/api/integrations/github/callback`,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Failed to exchange GitHub code for token:", errorData)
      return createPopupResponse("error", "github", "Failed to get GitHub access token.", baseUrl)
    }

    const tokens = await response.json()
    const accessToken = tokens.access_token

    const userInfoResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch GitHub user info")
      return createPopupResponse("error", "github", "Failed to fetch GitHub user info.", baseUrl)
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
        provider: "github",
        provider_user_id: providerAccountId.toString(),
        access_token: accessToken,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        scopes: tokens.scope ? tokens.scope.split(",") : null,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (dbError) {
      console.error("Error saving GitHub integration to DB:", dbError)
      return createPopupResponse(
        "error",
        "github",
        `Database Error: ${dbError.message}`,
        baseUrl,
      )
    }

    return createPopupResponse(
      "success",
      "github",
      "GitHub account connected successfully.",
      baseUrl,
    )
  } catch (error) {
    console.error("Error during GitHub OAuth callback:", error)
    const message = error instanceof Error ? error.message : "An unexpected error occurred"
    return createPopupResponse("error", "github", message, baseUrl)
  }
}
