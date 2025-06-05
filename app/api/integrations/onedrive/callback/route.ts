import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("OneDrive OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("OneDrive OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=onedrive", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in OneDrive callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=onedrive", baseUrl))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (provider !== "onedrive") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID!,
        client_secret: process.env.ONEDRIVE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/onedrive/callback`,
        scope: "https://graph.microsoft.com/Files.ReadWrite https://graph.microsoft.com/User.Read",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("OneDrive token exchange failed:", errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", { hasAccessToken: !!tokenData.access_token })
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from Microsoft Graph with proper headers
    console.log("Fetching user info from Microsoft Graph...")
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get user info from Microsoft Graph:", {
        status: userResponse.status,
        statusText: userResponse.statusText,
        error: errorData,
      })
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    const userData = await userResponse.json()
    console.log("User info fetched successfully:", { userId: userData.id, displayName: userData.displayName })

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("OneDrive: Session error:", sessionError)
      return NextResponse.redirect(
        new URL("/integrations?error=session_error&provider=onedrive&message=No+active+user+session+found", baseUrl),
      )
    }

    console.log("OneDrive: Session successfully retrieved for user:", sessionData.session.user.id)

    const integrationData = {
      user_id: sessionData.session.user.id,
      provider: "onedrive",
      provider_user_id: userData.id,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: ["https://graph.microsoft.com/Files.ReadWrite", "https://graph.microsoft.com/User.Read"],
      metadata: {
        user_name: userData.displayName,
        user_email: userData.mail || userData.userPrincipalName,
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...", {
      userId: sessionData.session.user.id,
      provider: "onedrive",
      reconnect,
      integrationId,
    })

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
        console.error("Error updating integration:", error)
        throw error
      }
      console.log("Integration updated successfully")
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Error inserting integration:", error)
        throw error
      }
      console.log("Integration created successfully")
    }

    console.log("OneDrive integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=onedrive_connected", baseUrl))
  } catch (error: any) {
    console.error("OneDrive OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=onedrive&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
