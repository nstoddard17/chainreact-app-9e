import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Dropbox OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Dropbox OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Dropbox callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "dropbox") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID + ":" + process.env.DROPBOX_CLIENT_SECRET).toString(
            "base64",
          ),
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: `${request.nextUrl.origin}/api/integrations/dropbox/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Dropbox token exchange failed:", errorData)
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    const { access_token, expires_in, account_id } = tokenData

    // Get user info from Dropbox
    const userResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
    })

    if (!userResponse.ok) {
      throw new Error("Failed to get user info")
    }

    const userData = await userResponse.json()

    // Store integration in Supabase
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error("No session found")
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "dropbox",
      provider_user_id: userData.account_id,
      access_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: ["files.content.write", "files.content.read"],
      metadata: {
        account_id: userData.account_id,
        user_name: userData.name?.display_name,
        user_email: userData.email,
        connected_at: new Date().toISOString(),
      },
    }

    if (reconnect && integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) throw error
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) throw error
    }

    console.log("Dropbox integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=dropbox_connected", request.url))
  } catch (error: any) {
    console.error("Dropbox OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
