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
    const { access_token, refresh_token, expires_in, scope, token_type } = tokenData

    // Get user info from Microsoft Graph
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

    // Microsoft Graph /me endpoint returns:
    // - id: string
    // - displayName: string
    // - userPrincipalName: string (email)
    // - mail: string (might be null)
    // - jobTitle: string
    // - officeLocation: string
    // etc.

    // Prepare integration data - Fixed to match actual Microsoft Graph API response
    const integrationData = {
      user_id: userId,
      provider: "teams",
      provider_user_id: userData.id,
      access_token: access_token,
      refresh_token: refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: scope ? scope.split(" ") : [],
      metadata: {
        display_name: userData.displayName || "Unknown User",
        email: userData.userPrincipalName || userData.mail || null,
        job_title: userData.jobTitle || null,
        office_location: userData.officeLocation || null,
        token_type: token_type || "Bearer",
        connected_at: new Date().toISOString(),
        raw_user_data: {
          id: userData.id,
          displayName: userData.displayName,
          userPrincipalName: userData.userPrincipalName,
          mail: userData.mail,
        },
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
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
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
