import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

function createPopupResponse(type: "success" | "error", provider: string, message: string, baseUrl: string) {
  const title = type === "success" ? `${provider} Connection Successful` : `${provider} Connection Failed`
  const header = type === "success" ? `${provider} Connected!` : `Error Connecting ${provider}`
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
      <head><title>${title}</title></head>
      <body>
        <h1>${header}</h1>
        <p>${message}</p>
        <p>This window will now close.</p>
        ${script}
      </body>
    </html>
  `
  return new Response(html, { headers: { "Content-Type": "text/html" } })
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  const baseUrl = getBaseUrl()

  if (error) {
    const message = errorDescription || error
    console.error(`Error with Twitter OAuth: ${message}`)
    return createPopupResponse("error", "twitter", `OAuth Error: ${message}`, baseUrl)
  }

  if (!code) {
    return createPopupResponse("error", "twitter", "No code provided for Twitter OAuth.", baseUrl)
  }

  if (!state) {
    return createPopupResponse("error", "twitter", "No state provided for Twitter OAuth.", baseUrl)
  }

  try {
    const { userId, codeVerifier } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse("error", "twitter", "Missing userId in Twitter state.", baseUrl)
    }
    if (!codeVerifier) {
      return createPopupResponse("error", "twitter", "Missing code_verifier in Twitter state.", baseUrl)
    }

    const tokenUrl = "https://api.twitter.com/2/oauth2/token"
    const body = new URLSearchParams({
      code: code,
      grant_type: "authorization_code",
      client_id: process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID!,
      redirect_uri: `${baseUrl}/api/integrations/twitter/callback`,
      code_verifier: codeVerifier,
    })

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Unknown error", error_description: "Failed to parse error response from Twitter." }))
      const message = errorData.error_description || errorData.error || "Failed to get Twitter access token."
      console.error("Failed to exchange Twitter code for token:", errorData)
      return createPopupResponse("error", "twitter", message, baseUrl)
    }

    const tokens = await response.json()
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const userInfoResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userInfoResponse.ok) {
      const errorData = await userInfoResponse.json().catch(() => ({ message: "Failed to parse error from Twitter API" }))
      console.error("Failed to fetch Twitter user info", errorData)
      return createPopupResponse("error", "twitter", errorData.message || "Failed to fetch Twitter user info.", baseUrl)
    }

    const userInfo = await userInfoResponse.json()
    const providerAccountId = userInfo.data.id

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { error: dbError } = await supabase.from("integrations").upsert(
      {
        user_id: userId,
        provider: "twitter",
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
      console.error("Error saving Twitter integration to DB:", dbError)
      return createPopupResponse("error", "twitter", `Database Error: ${dbError.message}`, baseUrl)
    }

    return createPopupResponse("success", "twitter", "Twitter account connected successfully.", baseUrl)
  } catch (error) {
    console.error("Error during Twitter OAuth callback:", error)
    const message = error instanceof Error ? error.message : "An unexpected error occurred."
    return createPopupResponse("error", "twitter", message, baseUrl)
  }
}
