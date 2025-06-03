import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Teams OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Teams OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Teams callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "teams") {
      throw new Error("Invalid provider in state")
    }

    // Get the origin for the redirect URI
    const origin = new URL(request.url).origin
    const redirectUri = `${origin}/api/integrations/teams/callback`

    console.log("Teams token exchange with redirect URI:", redirectUri)

    // Exchange code for access token
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
        new URL(`/integrations?error=token_exchange_failed&details=${encodeURIComponent(errorData)}`, request.url),
      )
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    console.log("Teams token exchange successful, fetching user info")

    // Get user info from Microsoft Graph
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get Teams user info:", errorData)
      return NextResponse.redirect(
        new URL(`/integrations?error=user_info_failed&details=${encodeURIComponent(errorData)}`, request.url),
      )
    }

    const userData = await userResponse.json()
    console.log("Teams user info retrieved:", { id: userData.id, name: userData.displayName })

    // Store integration in Supabase
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      console.error("No session found for Teams integration")
      return NextResponse.redirect(new URL("/integrations?error=session_expired", request.url))
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

    console.log("Saving Teams integration to database:", {
      userId: session.user.id,
      provider: "teams",
      reconnect,
      integrationId: integrationId || "new",
    })

    try {
      if (reconnect && integrationId) {
        // Update existing integration
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (updateError) {
          console.error("Teams integration update error:", updateError)
          throw updateError
        }

        console.log("Teams integration updated successfully")
      } else {
        // Create new integration
        const { error: insertError } = await supabase.from("integrations").insert(integrationData)

        if (insertError) {
          console.error("Teams integration insert error:", insertError)
          throw insertError
        }

        console.log("Teams integration created successfully")
      }
    } catch (dbError: any) {
      console.error("Teams database operation failed:", dbError)
      return NextResponse.redirect(
        new URL(`/integrations?error=database_error&details=${encodeURIComponent(dbError.message)}`, request.url),
      )
    }

    console.log("Teams integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=teams_connected", request.url))
  } catch (error: any) {
    console.error("Teams OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(`/integrations?error=callback_failed&details=${encodeURIComponent(error.message)}`, request.url),
    )
  }
}
