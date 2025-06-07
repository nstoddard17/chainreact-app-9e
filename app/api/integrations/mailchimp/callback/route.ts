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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Mailchimp OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Mailchimp OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=mailchimp", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in Mailchimp callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=mailchimp", baseUrl))
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(new URL("/integrations?error=invalid_state&provider=mailchimp", baseUrl))
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(new URL("/integrations?error=missing_user_id&provider=mailchimp", baseUrl))
    }

    const clientId = process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID
    const clientSecret = process.env.MAILCHIMP_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Mailchimp client ID or secret")
      return NextResponse.redirect(
        new URL("/integrations?error=missing_client_credentials&provider=mailchimp", baseUrl),
      )
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://login.mailchimp.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${getBaseUrl(request)}/api/integrations/mailchimp/callback`,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Mailchimp token exchange failed:", errorText)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=token_exchange_failed&provider=mailchimp&message=${encodeURIComponent(errorText)}`,
          baseUrl,
        ),
      )
    }

    const tokenData = await tokenResponse.json()
    const { access_token, expires_in } = tokenData

    console.log("Mailchimp token data:", { hasToken: !!access_token, expires_in })

    // Get user metadata
    const userResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
      headers: {
        Authorization: `OAuth ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error("Mailchimp user info failed:", errorText)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=user_info_failed&provider=mailchimp&message=${encodeURIComponent(errorText)}`,
          baseUrl,
        ),
      )
    }

    const userData = await userResponse.json()
    console.log("Mailchimp user data:", userData)
    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "mailchimp")
      .maybeSingle()

    const integrationData = {
      user_id: userId,
      provider: "mailchimp",
      provider_user_id: userData.user_id.toString(),
      access_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: ["basic_access"],
      metadata: {
        dc: userData.dc,
        api_endpoint: userData.api_endpoint,
        account_name: userData.accountname,
        connected_at: now,
      },
      updated_at: now,
    }

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Mailchimp integration:", error)
        return NextResponse.redirect(new URL("/integrations?error=database_update_failed&provider=mailchimp", baseUrl))
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Mailchimp integration:", error)
        return NextResponse.redirect(new URL("/integrations?error=database_insert_failed&provider=mailchimp", baseUrl))
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(
      new URL(`/integrations?success=mailchimp_connected&provider=mailchimp&t=${Date.now()}`, baseUrl),
    )
  } catch (error: any) {
    console.error("Mailchimp OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=mailchimp&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
