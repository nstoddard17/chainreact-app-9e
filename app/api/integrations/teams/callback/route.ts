import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

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
  })

  if (error) {
    console.error("Teams OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=oauth_error&provider=teams&message=${encodeURIComponent(errorDescription || error)}`,
        request.url,
      ),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Teams callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=teams", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "teams") {
      throw new Error("Invalid provider in state")
    }

    // Get the origin for the redirect URI
    const redirectUri = "https://chainreact.app/api/integrations/teams/callback"

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

    const tokenResponseText = await tokenResponse.text()
    console.log("Teams token response status:", tokenResponse.status)

    if (!tokenResponse.ok) {
      console.error("Teams token exchange failed:", tokenResponseText)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=token_exchange_failed&provider=teams&message=${encodeURIComponent(tokenResponseText)}`,
          request.url,
        ),
      )
    }

    const tokenData = JSON.parse(tokenResponseText)
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
        new URL(
          `/integrations?error=user_info_failed&provider=teams&message=${encodeURIComponent(errorData)}`,
          request.url,
        ),
      )
    }

    const userData = await userResponse.json()
    console.log("Teams user info retrieved:", { id: userData.id, name: userData.displayName })

    // Store integration in Supabase using server component client
    const supabase = createServerComponentClient({ cookies })

    // Get session from cookies
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Teams: Error retrieving session:", sessionError)
      return NextResponse.redirect(
        new URL("/integrations?error=session_error&provider=teams&message=Error+retrieving+session", request.url),
      )
    }

    if (!sessionData?.session) {
      console.error("Teams: No session found in cookies")
      return NextResponse.redirect(
        new URL("/integrations?error=session_expired&provider=teams&message=Please+log+in+again", request.url),
      )
    }

    console.log("Teams: Session successfully retrieved for user:", sessionData.session.user.id)

    const integrationData = {
      user_id: sessionData.session.user.id,
      provider: "teams",
      provider_user_id: userData.id,
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      status: "connected" as const,
      scopes: ["User.Read", "Chat.ReadWrite", "Team.ReadBasic.All"],
      metadata: {
        user_name: userData.displayName,
        user_email: userData.mail || userData.userPrincipalName,
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving Teams integration to database:", {
      userId: sessionData.session.user.id,
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
        new URL(
          `/integrations?error=database_error&provider=teams&message=${encodeURIComponent(dbError.message)}`,
          request.url,
        ),
      )
    }

    // Clear the cache and redirect to success page
    try {
      await fetch(`${request.nextUrl.origin}/api/integrations/clear-cache`, { method: "POST" })
      console.log("Cache cleared successfully")
    } catch (cacheError) {
      console.error("Failed to clear cache:", cacheError)
    }

    console.log("Teams integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=teams_connected&provider=teams", request.url))
  } catch (error: any) {
    console.error("Teams OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
