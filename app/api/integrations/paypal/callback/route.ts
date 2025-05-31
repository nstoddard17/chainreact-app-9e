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
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in PayPal callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "paypal") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
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
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from PayPal
    const userResponse = await fetch("https://api.paypal.com/v1/identity/oauth2/userinfo?schema=paypalv1.1", {
      headers: {
        Authorization: `Bearer ${access_token}`,
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
      provider: "paypal",
      provider_user_id: userData.user_id,
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      status: "connected" as const,
      scopes: ["https://uri.paypal.com/services/payments/payment"],
      metadata: {
        user_name: userData.name,
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

    console.log("PayPal integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=paypal_connected", request.url))
  } catch (error: any) {
    console.error("PayPal OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
