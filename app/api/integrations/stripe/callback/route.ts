import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Stripe OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Stripe OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Stripe callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "stripe") {
      throw new Error("Invalid provider in state")
    }

    const tokenResponse = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
      body: new URLSearchParams({
        client_secret: process.env.STRIPE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Stripe token exchange failed:", errorData)
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, stripe_user_id, stripe_publishable_key } = tokenData

    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      throw new Error("No session found")
    }

    const integrationData = {
      user_id: sessionData.session.user.id,
      provider: "stripe",
      provider_user_id: stripe_user_id,
      access_token,
      refresh_token,
      status: "connected" as const,
      scopes: ["read_write"],
      metadata: {
        stripe_user_id,
        stripe_publishable_key,
        connected_at: new Date().toISOString(),
      },
    }

    if (reconnect && integrationId) {
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) throw error
    } else {
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) throw error
    }

    console.log("Stripe integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=stripe_connected", request.url))
  } catch (error: any) {
    console.error("Stripe OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
