import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  console.log("Teams OAuth callback:", {
    code: !!code,
    state: !!state,
    error,
    errorDescription,
    url: request.url,
  })

  if (error) {
    console.error("Teams OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_error&details=${encodeURIComponent(errorDescription || error)}`, request.url),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Teams callback", { code: !!code, state: !!state })
    return NextResponse.redirect(
      new URL(
        `/integrations?error=missing_params&details=${encodeURIComponent("Missing authorization code or state parameter")}`,
        request.url,
      ),
    )
  }

  try {
    // Decode state to get provider info
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Decoded state data:", stateData)
    } catch (e) {
      console.error("Failed to decode state:", e)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=invalid_state&details=${encodeURIComponent("Invalid state parameter")}`,
          request.url,
        ),
      )
    }

    const { provider, reconnect, integrationId } = stateData

    if (provider !== "teams") {
      console.error("Invalid provider in state:", provider)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=invalid_provider&details=${encodeURIComponent("Invalid provider in state")}`,
          request.url,
        ),
      )
    }

    // Get the base URL for the redirect URI
    const baseUrl = new URL(request.url).origin
    const redirectUri = `${baseUrl}/api/integrations/teams/callback`
    console.log("Using redirect URI:", redirectUri)

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID!,
        client_secret: process.env.TEAMS_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Teams token exchange failed:", errorData)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=token_exchange_failed&details=${encodeURIComponent(
            "Failed to exchange code for token: " + errorData,
          )}`,
          request.url,
        ),
      )
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", {
      access_token: !!tokenData.access_token,
      refresh_token: !!tokenData.refresh_token,
      expires_in: tokenData.expires_in,
    })

    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from Microsoft Graph
    console.log("Fetching user info from Microsoft Graph...")
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get user info:", errorData)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=user_info_failed&details=${encodeURIComponent("Failed to get user info: " + errorData)}`,
          request.url,
        ),
      )
    }

    const userData = await userResponse.json()
    console.log("User info fetched successfully:", {
      id: userData.id,
      displayName: userData.displayName,
      email: userData.mail || userData.userPrincipalName,
    })

    // Store integration in Supabase
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      console.error("No session found")
      return NextResponse.redirect(
        new URL(
          `/integrations?error=session_expired&details=${encodeURIComponent("No active session found")}`,
          request.url,
        ),
      )
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "teams",
      provider_user_id: userData.id,
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      status: "connected" as const,
      scopes: ["https://graph.microsoft.com/Chat.ReadWrite", "https://graph.microsoft.com/Team.ReadBasic.All"],
      metadata: {
        user_name: userData.displayName,
        user_email: userData.mail || userData.userPrincipalName,
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...", {
      provider: "teams",
      reconnect,
      integrationId,
    })

    try {
      if (reconnect && integrationId) {
        // Update existing integration
        const { error } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (error) {
          console.error("Database error updating integration:", error)
          throw error
        }
        console.log("Integration updated successfully")
      } else {
        // Create new integration
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) {
          console.error("Database error inserting integration:", error)
          throw error
        }
        console.log("Integration created successfully")
      }
    } catch (dbError: any) {
      console.error("Database operation failed:", dbError)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=database_error&details=${encodeURIComponent(
            "Failed to save integration: " + dbError.message,
          )}`,
          request.url,
        ),
      )
    }

    console.log("Teams integration saved successfully")
    return NextResponse.redirect(new URL(`/integrations?success=teams_connected&providerId=teams`, request.url))
  } catch (error: any) {
    console.error("Teams OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&details=${encodeURIComponent(error.message || "Unknown error")}`,
        request.url,
      ),
    )
  }
}
