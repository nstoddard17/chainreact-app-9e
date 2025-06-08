import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export async function GET(request: NextRequest) {
  try {
    // Get code and state from query parameters
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    // Handle errors from Microsoft
    if (error) {
      console.error("Microsoft OAuth error:", error, errorDescription)
      return NextResponse.redirect(
        `${getBaseUrl()}/integrations?error=microsoft_error&message=${encodeURIComponent(
          errorDescription || "Authorization failed",
        )}`,
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${getBaseUrl()}/integrations?error=missing_params&message=${encodeURIComponent(
          "Missing required parameters",
        )}`,
      )
    }

    // Parse state parameter
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (error) {
      console.error("Failed to parse state:", error)
      return NextResponse.redirect(
        `${getBaseUrl()}/integrations?error=invalid_state&message=${encodeURIComponent("Invalid state parameter")}`,
      )
    }

    const { userId, reconnect, integrationId } = stateData

    // Create Supabase client
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Exchange code for token
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID!,
        client_secret: process.env.TEAMS_CLIENT_SECRET!,
        code,
        redirect_uri: `${getBaseUrl()}/api/integrations/teams/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Token exchange failed:", errorText)
      return NextResponse.redirect(
        `${getBaseUrl()}/integrations?error=token_exchange&message=${encodeURIComponent(
          `Failed to exchange code for token: ${errorText}`,
        )}`,
      )
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in, scope } = tokenData

    // Get user info
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.json()
      console.error("Failed to get user info:", errorData)
      return NextResponse.redirect(
        `${getBaseUrl()}/integrations?error=user_info&message=${encodeURIComponent("Failed to get user information")}`,
      )
    }

    const userData = await userResponse.json()

    // Prepare integration data
    const integrationData = {
      user_id: userId,
      provider: "teams",
      provider_user_id: userData.id,
      status: "connected",
      scopes: scope ? scope.split(" ") : [],
      metadata: {
        display_name: userData.displayName,
        email: userData.userPrincipalName,
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        raw_scope_string: scope,
        connected_at: new Date().toISOString(),
      },
    }

    // Update or insert integration
    if (reconnect && integrationId) {
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) {
        console.error("Failed to update integration:", error)
        return NextResponse.redirect(
          `${getBaseUrl()}/integrations?error=db_error&message=${encodeURIComponent(
            "Failed to update integration in database",
          )}`,
        )
      }
    } else {
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Failed to insert integration:", error)
        return NextResponse.redirect(
          `${getBaseUrl()}/integrations?error=db_error&message=${encodeURIComponent(
            "Failed to save integration to database",
          )}`,
        )
      }
    }

    // Add a small delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Redirect to success page
    return NextResponse.redirect(`${getBaseUrl()}/integrations?success=teams_connected&provider=teams&t=${Date.now()}`)
  } catch (error: any) {
    console.error("Teams callback error:", error)
    return NextResponse.redirect(
      `${getBaseUrl()}/integrations?error=unexpected&message=${encodeURIComponent(
        `An unexpected error occurred: ${error.message}`,
      )}`,
    )
  }
}
