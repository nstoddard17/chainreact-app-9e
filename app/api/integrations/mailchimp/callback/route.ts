import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Mailchimp OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Mailchimp OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Mailchimp callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "mailchimp") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://login.mailchimp.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID!,
        client_secret: process.env.MAILCHIMP_CLIENT_SECRET!,
        redirect_uri: `https://chainreact.app/api/integrations/mailchimp/callback`,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Mailchimp token exchange failed:", errorData)
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    const { access_token, expires_in } = tokenData

    // Get user info from Mailchimp
    const userResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
      headers: {
        Authorization: `OAuth ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error("Failed to get user info")
    }

    const userData = await userResponse.json()

    // Store integration in Supabase
    const supabase = getSupabaseClient()

    // Try to get session from cookies first
    let session = null
    try {
      const {
        data: { session: cookieSession },
      } = await supabase.auth.getSession()
      session = cookieSession
    } catch (error) {
      console.log("Failed to get session from cookies:", error)
    }

    // If no session from cookies, try to get from request headers
    if (!session) {
      try {
        const authHeader = request.headers.get("authorization")
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.substring(7)
          const {
            data: { user },
          } = await supabase.auth.getUser(token)
          if (user) {
            session = { user }
          }
        }
      } catch (error) {
        console.log("Failed to get session from headers:", error)
      }
    }

    // If still no session, try to get from URL state or create a temporary session
    if (!session) {
      console.log("No session found, attempting to handle OAuth callback without session")
      // For OAuth callbacks, we might need to handle this differently
      // Let's try to get user info from the state parameter
      try {
        const stateData = JSON.parse(atob(state))
        console.log("State data:", stateData)

        // If we have a reconnect scenario, we might be able to find the user
        if (stateData.reconnect && stateData.integrationId) {
          const { data: existingIntegration } = await supabase
            .from("integrations")
            .select("user_id")
            .eq("id", stateData.integrationId)
            .single()

          if (existingIntegration) {
            session = { user: { id: existingIntegration.user_id } }
            console.log("Found user from existing integration:", existingIntegration.user_id)
          }
        }
      } catch (error) {
        console.log("Failed to extract user from state:", error)
      }
    }

    if (!session) {
      console.error("No session found and unable to determine user")
      return NextResponse.redirect(new URL("/integrations?error=no_session", request.url))
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "mailchimp",
      provider_user_id: userData.user_id.toString(),
      access_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      status: "connected" as const,
      scopes: ["campaigns:read", "lists:write"],
      metadata: {
        dc: userData.dc,
        api_endpoint: userData.api_endpoint,
        account_name: userData.accountname,
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

    console.log("Mailchimp integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=mailchimp_connected", request.url))
  } catch (error: any) {
    console.error("Mailchimp OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
