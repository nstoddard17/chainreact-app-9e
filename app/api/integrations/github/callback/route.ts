import type { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const baseUrl = getBaseUrl()
  const provider = "github"

  if (error) {
    console.error(`Error with GitHub OAuth: ${error}`)
    return createPopupResponse("error", provider, `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse("error", provider, "No code or state provided for GitHub OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse("error", provider, "Missing userId in GitHub state.", baseUrl)
    }

    const supabase = createAdminClient()

    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${baseUrl}/api/integrations/github/callback`,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Failed to exchange GitHub code for token:", errorData)
      return createPopupResponse(
        "error",
        provider,
        errorData.error_description || "Failed to get GitHub access token.",
        baseUrl,
      )
    }

    const tokenData = await response.json()

    const expiresIn = tokenData.expires_in
    const refreshExpiresIn = tokenData.refresh_expires_in // GitHub provides this
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null
    const refreshTokenExpiresAt = refreshExpiresIn ? new Date(new Date().getTime() + refreshExpiresIn * 1000) : null

    const integrationData = {
      user_id: userId,
      provider: "github",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      refresh_token_expires_at: refreshTokenExpiresAt ? refreshTokenExpiresAt.toISOString() : null,
      scopes: tokenData.scope.split(","),
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      console.error("Error saving GitHub integration to DB:", upsertError)
      return createPopupResponse("error", provider, `Database Error: ${upsertError.message}`, baseUrl)
    }

    return createPopupResponse("success", provider, "GitHub account connected successfully.", baseUrl)
  } catch (error) {
    console.error("Error during GitHub OAuth callback:", error)
    const message = error instanceof Error ? error.message : "An unexpected error occurred"
    return createPopupResponse("error", provider, message, baseUrl)
  }
}
