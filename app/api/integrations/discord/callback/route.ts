import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")

  if (code) {
    const cookieStore = cookies()
    const supabase = createClient(cookieStore)

    // Exchange code for tokens
    const tokenEndpoint = "https://discord.com/api/oauth2/token"
    const client_id = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
    const client_secret = process.env.DISCORD_CLIENT_SECRET
    const redirect_uri = "https://chainreact.app/api/integrations/discord/callback"

    const tokenParams = new URLSearchParams({
      client_id: client_id || "",
      client_secret: client_secret || "",
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirect_uri || "",
    })

    const tokenResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenParams,
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error("Error exchanging code for token:", tokenData.error_description || tokenData.error)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=discord_token_exchange_failed&description=${tokenData.error_description || tokenData.error}`,
      )
    }

    // Use the access token to get user info
    const userEndpoint = "https://discord.com/api/users/@me"
    const userResponse = await fetch(userEndpoint, {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const userData = await userResponse.json()

    if (userData.error) {
      console.error("Error fetching user data:", userData.error)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=discord_user_fetch_failed&description=${userData.error}`,
      )
    }

    // Get user ID from cookie
    const userId = (await supabase.auth.getUser()).data?.user?.id

    if (!userId) {
      console.error("No user ID found in session.")
      return NextResponse.redirect(`https://chainreact.app/integrations?error=no_user_session`)
    }

    // After successful token exchange and user info retrieval, add:

    const integrationData = {
      user_id: userId,
      provider: "discord",
      provider_user_id: userData.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        username: userData.username,
        discriminator: userData.discriminator,
        avatar: userData.avatar,
        connected_at: new Date().toISOString(),
      },
    }

    // Check if integration exists and update or insert
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "discord")
      .single()

    if (existingIntegration) {
      const { error } = await supabase
        .from("integrations")
        .update({ ...integrationData, updated_at: new Date().toISOString() })
        .eq("id", existingIntegration.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from("integrations")
        .insert({ ...integrationData, created_at: new Date().toISOString() })

      if (error) throw error
    }

    return NextResponse.redirect(`https://chainreact.app/integrations?success=discord_connected&provider=discord`)
  } else {
    return NextResponse.redirect(`https://chainreact.app/integrations?error=discord_no_code`)
  }
}
