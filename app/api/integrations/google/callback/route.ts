import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Google OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state parameter")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Parse state parameter
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("State data:", stateData)

    // Exchange code for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `https://chainreact.app/api/integrations/google/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Token exchange failed:", errorText)
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful")

    // Get user info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const userData = await userResponse.json()
    console.log("User data retrieved:", userData.email)

    // Map provider to scopes
    const scopeMap: Record<string, string[]> = {
      "google-calendar": ["https://www.googleapis.com/auth/calendar"],
      "google-sheets": ["https://www.googleapis.com/auth/spreadsheets"],
      "google-docs": ["https://www.googleapis.com/auth/documents"],
      gmail: ["https://www.googleapis.com/auth/gmail.modify"],
      youtube: ["https://www.googleapis.com/auth/youtube.upload"],
    }

    const scopes = scopeMap[provider] || []

    // Save integration to database
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error("No active session")
    }

    if (reconnect && integrationId) {
      // Update existing integration
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          status: "connected",
          provider_user_id: userData.id,
          metadata: {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
            user_email: userData.email,
            user_name: userData.name,
            scopes: scopes,
            connected_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (updateError) throw updateError
    } else {
      // Create new integration
      const { error: insertError } = await supabase.from("integrations").insert({
        user_id: session.user.id,
        provider: provider,
        provider_user_id: userData.id,
        status: "connected",
        metadata: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
          user_email: userData.email,
          user_name: userData.name,
          scopes: scopes,
          connected_at: new Date().toISOString(),
        },
      })

      if (insertError) throw insertError
    }

    console.log("Integration saved successfully")
    return NextResponse.redirect(new URL(`/integrations?success=${provider}`, request.url))
  } catch (error) {
    console.error("OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_error", request.url))
  }
}
