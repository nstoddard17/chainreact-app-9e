import { NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import supabaseAdmin from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      console.error("Microsoft OneNote OAuth error:", error)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=microsoft-onenote&message=${encodeURIComponent(error)}`,
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=microsoft-onenote&message=${encodeURIComponent("Missing code or state")}`,
      )
    }

    // Parse state to get user info
    const stateData = JSON.parse(atob(state))
    const { userId, provider } = stateData

    if (provider !== "microsoft-onenote") {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=microsoft-onenote&message=${encodeURIComponent("Invalid provider")}`,
      )
    }

    // Exchange code for token
    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"
    const redirectUri = `${baseUrl}/api/integrations/microsoft-onenote/callback`

    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      console.error("Microsoft OneNote token exchange failed:", tokenData)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=microsoft-onenote&message=${encodeURIComponent("Token exchange failed")}`,
      )
    }

    // Get user info
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to get Microsoft OneNote user info")
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=microsoft-onenote&message=${encodeURIComponent("Failed to get user info")}`,
      )
    }

    const userData = await userResponse.json()

    // Calculate expiry time
    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null

    // Store integration
    const integrationData = {
      user_id: userId,
      provider: provider,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      status: 'connected',
      updated_at: new Date().toISOString(),
    }

    const { error: insertError } = await supabaseAdmin
      .from("integrations")
      .upsert(integrationData, { onConflict: "user_id,provider" })

    if (insertError) {
      console.error("Failed to store Microsoft OneNote integration:", insertError)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=microsoft-onenote&message=${encodeURIComponent("Failed to store integration")}`,
      )
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?success=microsoft-onenote&message=${encodeURIComponent("Successfully connected to Microsoft OneNote")}`,
    )
  } catch (error) {
    console.error("Microsoft OneNote callback error:", error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/integrations?error=microsoft-onenote&message=${encodeURIComponent("Unexpected error occurred")}`,
    )
  }
} 