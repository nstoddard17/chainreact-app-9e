import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("PayPal OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("PayPal OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=paypal", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in PayPal callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=paypal", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (provider !== "paypal") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://api.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET).toString(
            "base64",
          ),
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${request.nextUrl.origin}/api/integrations/paypal/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("PayPal token exchange failed:", errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", { hasAccessToken: !!tokenData.access_token })
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from PayPal
    console.log("Fetching user info from PayPal...")
    const userResponse = await fetch("https://api.paypal.com/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get user info from PayPal:", errorData)
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    const userData = await userResponse.json()
    console.log("User info fetched successfully:", { userId: userData.user_id })

    // Store integration in Supabase with robust session handling
    const supabase = getSupabaseClient()

    // Try multiple methods to get session
    let session = null
    try {
      const {
        data: { session: cookieSession },
      } = await supabase.auth.getSession()
      session = cookieSession
      console.log("Session from cookies:", !!session)
    } catch (error) {
      console.log("Failed to get session from cookies:", error)
    }

    // If no session from cookies, try authorization headers
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
            console.log("Session from auth header:", !!session)
          }
        }
      } catch (error) {
        console.log("Failed to get session from headers:", error)
      }
    }

    // For reconnection scenarios, try to find user from existing integration
    if (!session && reconnect && integrationId) {
      try {
        const { data: existingIntegration } = await supabase
          .from("integrations")
          .select("user_id")
          .eq("id", integrationId)
          .single()

        if (existingIntegration) {
          session = { user: { id: existingIntegration.user_id } }
          console.log("Session from existing integration:", !!session)
        }
      } catch (error) {
        console.log("Failed to get user from existing integration:", error)
      }
    }

    if (!session) {
      console.error("No session found after all attempts")
      return NextResponse.redirect(new URL("/integrations?error=no_session&provider=paypal", request.url))
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "paypal",
      provider_user_id: userData.user_id,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: ["https://uri.paypal.com/services/payments/payment"],
      metadata: {
        user_name: userData.name,
        user_email: userData.email,
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...", {
      userId: session.user.id,
      provider: "paypal",
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

    console.log("PayPal integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=paypal_connected", request.url))
  } catch (error: any) {
    console.error("PayPal OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=paypal&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
