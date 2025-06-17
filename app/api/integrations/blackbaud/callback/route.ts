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
    console.error(`Blackbaud OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse("error", "blackbaud", errorDescription || "An unknown error occurred.", baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse(
      "error",
      "blackbaud",
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

    const clientId = process.env.NEXT_PUBLIC_BLACKBAUD_CLIENT_ID
    const clientSecret = process.env.BLACKBAUD_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Blackbaud client ID or secret not configured")
    }
    
    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`

    const tokenResponse = await fetch("https://oauth2.sky.blackbaud.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": authHeader,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/blackbaud/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Blackbaud token exchange failed: ${errorData.error_description || errorData.error}`)
    }

    const tokenData = await tokenResponse.json()
    
    const expiresIn = tokenData.expires_in // Typically in seconds
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    const userResponse = await fetch("https://api.sky.blackbaud.com/constituent/v1/constituents/me", {
        headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
            "Bb-Api-Subscription-Key": process.env.BLACKBAUD_SUBSCRIPTION_KEY!,
        }
    });

    if(!userResponse.ok) {
        throw new Error("Failed to fetch Blackbaud user info");
    }

    const userData = await userResponse.json();

    const integrationData = {
      user_id: userId,
      provider: "blackbaud",
      provider_user_id: userData.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Blackbaud integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", "blackbaud", "Blackbaud account connected successfully.", baseUrl)
  } catch (e: any) {
    console.error("Blackbaud callback error:", e)
    return createPopupResponse("error", "blackbaud", e.message || "An unexpected error occurred.", baseUrl)
  }
} 