import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { YouTubeOAuthService } from "@/lib/oauth/youtube"

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables:", {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
  })
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  console.log("=== YouTube OAuth Callback Started ===")

  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("YouTube OAuth callback params:", {
    hasCode: !!code,
    state: state?.substring(0, 50) + "...",
    error,
    baseUrl,
  })

  if (error) {
    console.error("YouTube OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=true&provider=youtube", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in YouTube callback")
    return NextResponse.redirect(
      new URL("/integrations?error=true&provider=youtube&message=Missing+parameters", baseUrl),
    )
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Parsed state data:", { userId: stateData.userId, provider: stateData.provider })
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(new URL("/integrations?error=true&provider=youtube&message=Invalid+state", baseUrl))
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(
        new URL("/integrations?error=true&provider=youtube&message=Missing+user+ID", baseUrl),
      )
    }

    console.log("Processing YouTube OAuth for user:", userId)

    // Exchange code for tokens using the service
    const redirectUri = `${getBaseUrl(request)}/api/integrations/youtube/callback`
    const tokenData = await YouTubeOAuthService.exchangeCodeForTokens(code, redirectUri)

    console.log("Token exchange successful:", {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
    })

    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info using the service
    const userInfo = await YouTubeOAuthService.getUserInfo(access_token)
    console.log("User info retrieved:", {
      id: userInfo.id,
      name: userInfo.name,
      hasMetadata: !!userInfo.metadata,
    })

    const now = new Date().toISOString()
    const expiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null

    // Check if integration exists
    console.log("Checking for existing integration...")
    const { data: existingIntegration, error: findError } = await supabase
      .from("integrations")
      .select("id, status, created_at")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .maybeSingle()

    if (findError) {
      console.error("Error checking for existing integration:", findError)
    } else {
      console.log("Existing integration check:", {
        found: !!existingIntegration,
        id: existingIntegration?.id,
        status: existingIntegration?.status,
      })
    }

    // Prepare integration data using existing database schema
    const integrationData = {
      user_id: userId,
      provider: "youtube",
      provider_account_id: userInfo.id,
      access_token,
      refresh_token,
      expires_at: expiresAt,
      token_type: "Bearer",
      scope: tokenData.scope || "https://www.googleapis.com/auth/youtube.readonly",
      metadata: {
        ...userInfo.metadata,
        name: userInfo.name,
        email: userInfo.email,
        avatar: userInfo.avatar,
        connected_at: now,
      },
      is_active: true,
      updated_at: now,
    }

    console.log("Integration data prepared:", {
      user_id: integrationData.user_id,
      provider: integrationData.provider,
      provider_account_id: integrationData.provider_account_id,
      token_type: integrationData.token_type,
      hasAccessToken: !!integrationData.access_token,
      hasRefreshToken: !!integrationData.refresh_token,
      expires_at: integrationData.expires_at,
      is_active: integrationData.is_active,
    })

    let result
    if (existingIntegration) {
      console.log("Updating existing YouTube integration:", existingIntegration.id)
      result = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id).select()
    } else {
      console.log("Creating new YouTube integration")
      result = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
        })
        .select()
    }

    if (result.error) {
      console.error("Database operation failed:", result.error)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=true&provider=youtube&message=${encodeURIComponent(result.error.message)}`,
          baseUrl,
        ),
      )
    }

    console.log("YouTube integration saved successfully:", result.data?.[0]?.id)

    // Add delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    console.log("=== YouTube OAuth Callback Completed Successfully ===")

    return NextResponse.redirect(
      new URL(`/integrations?success=youtube_connected&provider=youtube&t=${Date.now()}`, baseUrl),
    )
  } catch (error: any) {
    console.error("YouTube OAuth callback error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    return NextResponse.redirect(
      new URL(`/integrations?error=true&provider=youtube&message=${encodeURIComponent(error.message)}`, baseUrl),
    )
  }
}
