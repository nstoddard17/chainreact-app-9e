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

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  const baseUrl = getBaseUrl(req)
  const redirectUri = `${baseUrl}/api/integrations/onedrive/callback`

  console.log("OneDrive callback received:", {
    hasCode: !!code,
    hasState: !!state,
    error,
    error_description,
  })

  if (error) {
    console.error("OneDrive Auth Error:", error, error_description)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent(error_description || error)}`,
    )
  }

  if (!code || !state) {
    console.error("Missing code or state")
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Missing authorization code or state")}`,
    )
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Parsed state data:", stateData)
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Invalid state parameter")}`,
      )
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Missing user ID in state")}`,
      )
    }

    const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing OneDrive client ID or secret")
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("OneDrive OAuth not configured")}`,
      )
    }

    console.log("Exchanging code for tokens...")

    const tokenEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    const body = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
    })

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Token request failed", response.status, errorText)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Failed to exchange authorization code for tokens")}`,
      )
    }

    const data = await response.json()
    const accessToken = data.access_token
    const refreshToken = data.refresh_token
    const expires_in = data.expires_in

    console.log("Token exchange successful:", {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expires_in,
    })

    if (!accessToken || !refreshToken) {
      console.error("Missing access token or refresh token")
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Missing tokens in response")}`,
      )
    }

    // Get user info
    console.log("Fetching user info...")
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error("Failed to get OneDrive user info:", errorText)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Failed to get user information")}`,
      )
    }

    const userData = await userResponse.json()
    console.log("User data retrieved:", {
      id: userData.id,
      displayName: userData.displayName,
      email: userData.userPrincipalName,
    })

    const now = new Date().toISOString()

    // Check if integration exists
    console.log("Checking for existing integration...")
    const { data: existingIntegration, error: selectError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "onedrive")
      .maybeSingle()

    if (selectError) {
      console.error("Error checking for existing integration:", selectError)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Database error checking existing integration")}`,
      )
    }

    const integrationData = {
      user_id: userId,
      provider: "onedrive",
      provider_user_id: userData.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: data.scope ? data.scope.split(" ") : [],
      metadata: {
        display_name: userData.displayName,
        email: userData.userPrincipalName,
        connected_at: now,
      },
      updated_at: now,
    }

    console.log("Saving integration data:", {
      provider: integrationData.provider,
      status: integrationData.status,
      hasExisting: !!existingIntegration,
    })

    if (existingIntegration) {
      const { error: updateError } = await supabase
        .from("integrations")
        .update(integrationData)
        .eq("id", existingIntegration.id)

      if (updateError) {
        console.error("Error updating OneDrive integration:", updateError)
        return NextResponse.redirect(
          `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Failed to update integration in database")}`,
        )
      }
      console.log("Integration updated successfully")
    } else {
      const { error: insertError } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (insertError) {
        console.error("Error inserting OneDrive integration:", insertError)
        return NextResponse.redirect(
          `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent("Failed to save integration to database")}`,
        )
      }
      console.log("Integration created successfully")
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 1000))

    console.log("OneDrive integration completed successfully, redirecting...")
    return NextResponse.redirect(`${baseUrl}/integrations?success=true&provider=onedrive&t=${Date.now()}`)
  } catch (e: any) {
    console.error("Error during OneDrive auth:", e)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=true&provider=onedrive&message=${encodeURIComponent(e.message || "Unknown error occurred")}`,
    )
  }
}
