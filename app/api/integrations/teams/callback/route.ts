import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const cookieStore = cookies()
  const supabase = createClient(cookieStore)

  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=teams_no_code`)
  }

  if (!state) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=teams_no_state`)
  }

  const storedState = cookieStore.get("teams_oauth_state")?.value

  if (state !== storedState) {
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=teams_invalid_state`)
  }

  try {
    const redirectUri = "https://chainreact.app/api/integrations/teams/callback"

    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.TEAMS_CLIENT_ID as string,
        client_secret: process.env.TEAMS_CLIENT_SECRET as string,
        code: code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      console.error("Token request failed:", tokenResponse.status, await tokenResponse.text())
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=teams_token_error`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token

    // Fetch user profile information
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!profileResponse.ok) {
      console.error("Profile request failed:", profileResponse.status, await profileResponse.text())
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=teams_profile_error`)
    }

    const profileData = await profileResponse.json()
    const email = profileData.mail || profileData.userPrincipalName
    const teamId = profileData.id
    const displayName = profileData.displayName

    if (!email) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=teams_no_email`)
    }

    const { data: existingUser, error: selectError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email)
      .single()

    if (selectError) {
      console.error("Supabase select error:", selectError)
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=teams_supabase_error`)
    }

    if (!existingUser) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=teams_user_not_found`)
    }

    const userId = existingUser.id

    const { error: teamsIntegrationError } = await supabase.from("teams_integration").insert({
      user_id: userId,
      team_id: teamId,
      email: email,
      access_token: accessToken,
      display_name: displayName,
    })

    if (teamsIntegrationError) {
      console.error("Supabase teams integration error:", teamsIntegrationError)
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=teams_integration_failed`)
    }

    return NextResponse.redirect(`https://chainreact.app/integrations?success=teams_connected`)
  } catch (e) {
    console.error("Teams OAuth error:", e)
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=teams_oauth_failed`)
  }
}
