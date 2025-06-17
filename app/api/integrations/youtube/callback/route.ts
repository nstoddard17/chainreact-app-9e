import { type NextRequest } from "next/server"
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
  console.log("YouTube OAuth callback received")
  const baseUrl = getBaseUrl()

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      const errorDescription =
        searchParams.get("error_description") || "An unknown error occurred."
      return createPopupResponse("error", "youtube", `${error}: ${errorDescription}`, baseUrl)
    }

    if (!code || !state) {
      return createPopupResponse(
        "error",
        "youtube",
        "Missing code or state.",
        baseUrl,
      )
    }

    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse("error", "youtube", "Missing userId in state.", baseUrl)
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${baseUrl}/api/integrations/youtube/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      return createPopupResponse("error", "youtube", `Error exchanging token: ${errorText}`, baseUrl)
    }

    const tokens = await tokenResponse.json()

    // Get user info from Google
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    )

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text()
      return createPopupResponse(
        "error",
        "youtube",
        `Error fetching channel info: ${errorText}`,
        baseUrl,
      )
    }

    const userInfo = await userInfoResponse.json()
    if (!userInfo.items || userInfo.items.length === 0) {
      return createPopupResponse("error", "youtube", "No YouTube channel found for this account.", baseUrl)
    }
    const channel = userInfo.items[0]

    const integrationData = {
      user_id: userId,
      provider: "youtube",
      provider_user_id: channel.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope.split(" "),
      metadata: {
        name: channel.snippet.title,
        picture: channel.snippet.thumbnails.default.url,
      },
      status: "connected",
    }

    // Upsert integration into database
    const { error: dbError } = await supabase
      .from("integrations")
      .upsert(integrationData, { onConflict: "user_id, provider" })

    if (dbError) {
      return createPopupResponse("error", "youtube", `Database Error: ${dbError.message}`, baseUrl)
    }

    return createPopupResponse(
      "success",
      "youtube",
      "YouTube account connected successfully.",
      baseUrl,
    )
  } catch (error: any) {
    console.error("YouTube callback error:", error)
    return createPopupResponse("error", "youtube", error.message, baseUrl)
  }
}
