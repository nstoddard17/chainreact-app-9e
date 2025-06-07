import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { TwitterOAuthService } from "@/lib/oauth/twitter"

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
  const errorDescription = searchParams.get("error_description")

  console.log("X (Twitter) OAuth callback received:", {
    hasCode: !!code,
    hasState: !!state,
    error,
    errorDescription,
    baseUrl,
    fullUrl: request.url,
  })

  if (error) {
    console.error("X (Twitter) OAuth error:", { error, errorDescription })
    const errorMessage = errorDescription || error
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_error&provider=twitter&message=${encodeURIComponent(errorMessage)}`, baseUrl),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in X (Twitter) callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=twitter", baseUrl))
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Parsed state data:", stateData)
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(new URL("/integrations?error=invalid_state&provider=twitter", baseUrl))
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(new URL("/integrations?error=missing_user_id&provider=twitter", baseUrl))
    }

    console.log("Processing Twitter OAuth for user:", userId)

    // Use the TwitterOAuthService to handle the callback
    const result = await TwitterOAuthService.handleCallback(code, state, baseUrl, supabase, userId)

    if (result.success) {
      console.log("Twitter OAuth successful, redirecting to:", result.redirectUrl)
      // Add a delay to ensure database operations complete
      await new Promise((resolve) => setTimeout(resolve, 1000))
      return NextResponse.redirect(new URL(result.redirectUrl))
    } else {
      console.error("Twitter OAuth failed:", result.error)
      return NextResponse.redirect(new URL(result.redirectUrl))
    }
  } catch (error: any) {
    console.error("X (Twitter) OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
