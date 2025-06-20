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
    console.error(`LinkedIn OAuth error: ${error} - ${errorDescription}`)
    return createPopupResponse(
      "error",
      "linkedin",
      errorDescription || "An unknown error occurred.",
      baseUrl,
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in LinkedIn callback")
    return createPopupResponse(
      "error",
      "linkedin",
      "Authorization code or state parameter is missing.",
      baseUrl,
    )
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      throw new Error("User ID is missing from state")
    }

    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("LinkedIn client ID or secret not configured")
    }

    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/linkedin/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`LinkedIn token exchange failed: ${errorData.error_description || "Unknown error"}`)
    }

    const tokenData = await tokenResponse.json()

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Get user info
    console.log('LinkedIn: Attempting to get user info with token:', tokenData.access_token ? 'TOKEN_PRESENT' : 'NO_TOKEN')
    
    const userResponse = await fetch("https://api.linkedin.com/v2/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    console.log('LinkedIn user info response status:', userResponse.status)
    console.log('LinkedIn user info response headers:', Object.fromEntries(userResponse.headers.entries()))

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error('LinkedIn user info error response:', errorText)
      throw new Error(`Failed to get LinkedIn user info: ${userResponse.status} ${errorText}`)
    }

    const userData = await userResponse.json()

    const integrationData = {
      user_id: userId,
      provider: "linkedin",
      provider_user_id: userData.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      console.error("Supabase upsert error:", upsertError)
      throw new Error(`Failed to save LinkedIn integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", "linkedin", "Successfully connected to LinkedIn.", baseUrl)
  } catch (e: any) {
    console.error("LinkedIn callback error:", e)
    return createPopupResponse("error", "linkedin", e.message || "An unexpected error occurred.", baseUrl)
  }
}
