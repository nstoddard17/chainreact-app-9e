import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`Gumroad OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse(
      "error",
      "gumroad",
      errorDescription || "An unknown error occurred.",
      baseUrl,
    )
  }

  if (!code || !state) {
    return createPopupResponse(
      "error",
      "gumroad",
      "Authorization code or state parameter is missing.",
      baseUrl,
    )
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      throw new Error("User ID not found in state")
    }

    const clientId = process.env.NEXT_PUBLIC_GUMROAD_CLIENT_ID
    const clientSecret = process.env.GUMROAD_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Gumroad client ID or secret not configured")
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://gumroad.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/gumroad/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(
        `Gumroad token exchange failed: ${errorData.error_description || errorData.error}`,
      )
    }

    const tokenData = await tokenResponse.json()

    // Get user information using the access token
    const userResponse = await fetch("https://api.gumroad.com/v2/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error("Failed to get Gumroad user info")
    }

    const userData = await userResponse.json()

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    const integrationData = {
      user_id: userId,
      provider: "gumroad",
      provider_user_id: userData.id || null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: ["view_profile", "edit_products", "view_sales", "mark_sales_as_shipped", "refund_sales"],
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    // Insert or update the integration
    const { error: insertError } = await supabase
      .from("integrations")
      .upsert(integrationData, { onConflict: "user_id,provider" })

    if (insertError) {
      console.error("Failed to save Gumroad integration:", insertError)
      throw new Error("Failed to save integration data")
    }

    return createPopupResponse(
      "success",
      "gumroad",
      "Successfully connected to Gumroad!",
      baseUrl,
    )
  } catch (error: any) {
    console.error("Gumroad OAuth callback error:", error)
    return createPopupResponse(
      "error",
      "gumroad",
      error.message || "An unexpected error occurred.",
      baseUrl,
    )
  }
} 