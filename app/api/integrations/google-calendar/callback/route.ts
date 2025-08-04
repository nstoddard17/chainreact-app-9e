import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"

// Create a Supabase client with admin privileges
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: NextRequest) {
  console.log("Google Calendar OAuth callback received")
  const baseUrl = getBaseUrl()
  const provider = "google-calendar"

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      const errorDescription =
        searchParams.get("error_description") || "An unknown error occurred."
      console.error("Google Calendar OAuth error:", error, errorDescription)
      return createPopupResponse(
        "error",
        provider,
        `${error}: ${errorDescription}`,
        baseUrl,
      )
    }

    if (!code || !state) {
      console.error("Missing code or state in Google Calendar callback")
      return createPopupResponse(
        "error",
        provider,
        "Authorization code or state is missing.",
        baseUrl,
      )
    }

    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Invalid state parameter in Google Calendar callback:", e)
      return createPopupResponse(
        "error",
        provider,
        "Invalid state parameter.",
        baseUrl,
      )
    }

    const { userId, provider: stateProvider } = stateData
    
    // Validate that this callback is for the correct provider
    if (stateProvider && stateProvider !== provider) {
      console.error(`Provider mismatch in Google Calendar callback. Expected: ${provider}, Got: ${stateProvider}`)
      return createPopupResponse(
        "error",
        provider,
        "Provider mismatch in OAuth callback.",
        baseUrl,
      )
    }
    
    if (!userId) {
      console.error("Missing userId in Google Calendar state")
      return createPopupResponse(
        "error",
        provider,
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
        redirect_uri: `${baseUrl}/api/integrations/google-calendar/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Google Calendar token exchange failed:", errorText)
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
        "google-calendar",
        `Token exchange failed: ${errorDescription}`,
        baseUrl,
      )
    }

    const tokenData = await tokenResponse.json()

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Get user info from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to get Google Calendar user info")
      return createPopupResponse(
        "error",
        "google-calendar",
        "Could not fetch user information from Google.",
        baseUrl,
      )
    }

    const userInfo = await userInfoResponse.json()

    const integrationData = {
      user_id: userId,
      provider: provider,
      provider_user_id: userInfo.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: tokenData.scope.split(" "),
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(integrationData, { onConflict: "user_id, provider" })

    if (upsertError) {
      console.error("Error saving Google Calendar integration to DB:", upsertError)
      return createPopupResponse(
        "error",
        provider,
        `Database error: ${upsertError.message}`,
        baseUrl,
      )
    }

    return createPopupResponse(
      "success",
      provider,
      "Your Google Calendar account has been successfully connected.",
      baseUrl,
    )
  } catch (error: any) {
    console.error("Google Calendar callback error:", error)
    const errorMessage = error.message || "An unexpected error occurred."
    return createPopupResponse("error", provider, errorMessage, baseUrl)
  }
}
