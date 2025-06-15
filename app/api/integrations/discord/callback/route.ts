import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const discordClientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
const discordClientSecret = process.env.DISCORD_CLIENT_SECRET

if (!discordClientId || !discordClientSecret) {
  throw new Error("NEXT_PUBLIC_DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET must be defined")
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error("Discord OAuth error:", error)
    return NextResponse.redirect(`https://chainreact.app/integrations?error=discord_oauth_failed&message=${error}`)
  }

  if (!code || !state) {
    console.error("Missing code or state in Discord callback")
    return NextResponse.redirect(`https://chainreact.app/integrations?error=discord_oauth_failed`)
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`https://chainreact.app/integrations?error=invalid_state`)
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(`https://chainreact.app/integrations?error=missing_user_id`)
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: discordClientId,
        client_secret: discordClientSecret,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: "https://chainreact.app/api/integrations/discord/callback",
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok || tokenData.error) {
      console.error("Discord token exchange error:", tokenData)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=token_exchange_failed&message=${encodeURIComponent(tokenData.error_description || "Unknown error")}`,
      )
    }

    const accessToken = tokenData.access_token

    if (!accessToken) {
      console.error("No access token in response")
      return NextResponse.redirect(`https://chainreact.app/integrations?error=missing_access_token`)
    }

    // Get user info from Discord
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const userData = await userResponse.json()

    if (!userResponse.ok) {
      console.error("Discord user info error:", userData)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=user_info_failed&message=${encodeURIComponent(userData.message || "Unknown error")}`,
      )
    }

    const now = new Date().toISOString()

    const integrationData = {
      user_id: userId,
      provider: "discord",
      provider_user_id: userData.id,
      access_token: accessToken,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        username: userData.username,
        discriminator: userData.discriminator,
        avatar: userData.avatar,
        email: userData.email,
        verified: userData.verified,
        connected_at: now,
      },
      updated_at: now,
    }

    // Check if integration exists and update or insert
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "discord")
      .maybeSingle()

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Discord integration:", error)
        return NextResponse.redirect(`https://chainreact.app/integrations?error=database_update_failed`)
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Discord integration:", error)
        return NextResponse.redirect(`https://chainreact.app/integrations?error=database_insert_failed`)
      }
    }

    return NextResponse.redirect(
      `https://chainreact.app/integrations?success=discord_connected&provider=discord&t=${Date.now()}`,
    )
  } catch (error: any) {
    console.error("Error during Discord callback:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=discord_oauth_failed&message=${encodeURIComponent(error.message)}`,
    )
  }
}
