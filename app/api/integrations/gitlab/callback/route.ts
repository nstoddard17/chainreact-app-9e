import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  if (error) {
    console.error("GitLab OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=${error}&provider=gitlab&message=${encodeURIComponent(
        errorDescription || "Authorization failed",
      )}`,
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=missing_params&provider=gitlab`)
  }

  try {
    let stateData: any = {}
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=invalid_state&provider=gitlab`)
    }

    const { userId } = stateData

    if (!userId) {
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=missing_user_id&provider=gitlab`)
    }

    const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
    const clientSecret = process.env.GITLAB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=missing_credentials&provider=gitlab`)
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${getBaseUrl(request)}/api/integrations/gitlab/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("GitLab token exchange failed:", errorText)
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=token_exchange_failed&provider=gitlab`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info
    const userResponse = await fetch("https://gitlab.com/api/v4/user", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("GitLab user info failed:", await userResponse.text())
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=user_info_failed&provider=gitlab`)
    }

    const userData = await userResponse.json()
    const now = new Date().toISOString()

    const integrationData = {
      user_id: userId,
      provider: "gitlab",
      provider_user_id: userData.id.toString(),
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: ["read_user", "read_api", "read_repository", "write_repository"],
      metadata: {
        username: userData.username,
        name: userData.name,
        email: userData.email,
        avatar_url: userData.avatar_url,
        connected_at: now,
      },
      updated_at: now,
    }

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "gitlab")
      .maybeSingle()

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating GitLab integration:", error)
        return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=database_update_failed&provider=gitlab`)
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting GitLab integration:", error)
        return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=database_insert_failed&provider=gitlab`)
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?success=gitlab_connected&provider=gitlab&t=${Date.now()}`,
    )
  } catch (error: any) {
    console.error("GitLab OAuth callback error:", error)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(error.message)}`,
    )
  }
}
