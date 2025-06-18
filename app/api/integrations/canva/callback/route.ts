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
    console.error(`Canva OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse("error", "canva", errorDescription || "An unknown error occurred.", baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse(
      "error",
      "canva",
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

    const clientId = process.env.NEXT_PUBLIC_CANVA_CLIENT_ID
    const clientSecret = process.env.CANVA_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Canva client ID or secret not configured")
    }

    const tokenResponse = await fetch("https://www.canva.com/api/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/canva/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Canva token exchange failed: ${errorData.error_description || errorData.error}`)
    }

    const tokenData = await tokenResponse.json()

    const expiresIn = tokenData.expires_in // Typically in seconds
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Canva does not have a /me endpoint. The user is identified by the token.
    // The "user" field in the token response is the unique ID for the user.
    const providerUserId = tokenData.user

    const integrationData = {
      user_id: userId,
      provider: "canva",
      provider_user_id: providerUserId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: [], // Canva doesn't return scopes in the token response
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Canva integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", "canva", "Canva account connected successfully.", baseUrl)
  } catch (e: any) {
    console.error("Canva callback error:", e)
    return createPopupResponse("error", "canva", e.message || "An unexpected error occurred.", baseUrl)
  }
} 