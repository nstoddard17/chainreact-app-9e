import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { GitLabOAuthService } from "@/lib/oauth/gitlab"

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

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  const baseUrl = getBaseUrl(request)

  console.log("GitLab OAuth callback received:", {
    hasCode: !!code,
    hasState: !!state,
    error,
    errorDescription,
  })

  if (error) {
    console.error("GitLab OAuth error:", error, errorDescription)

    let userFriendlyMessage = "Authorization failed"
    if (error === "access_denied") {
      userFriendlyMessage = "Authorization was cancelled"
    } else if (errorDescription) {
      userFriendlyMessage = errorDescription
    }

    return NextResponse.redirect(
      `${baseUrl}/integrations?error=oauth_error&provider=gitlab&message=${encodeURIComponent(userFriendlyMessage)}`,
    )
  }

  if (!code || !state) {
    console.error("Missing required parameters:", { code: !!code, state: !!state })
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=missing_params&provider=gitlab&message=${encodeURIComponent("Missing authorization code or state parameter")}`,
    )
  }

  try {
    // Parse state to get user ID
    let stateData: any = {}
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=invalid_state&provider=gitlab&message=${encodeURIComponent("Invalid state parameter")}`,
      )
    }

    const { userId } = stateData

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=missing_user_id&provider=gitlab&message=${encodeURIComponent("Missing user ID in state")}`,
      )
    }

    console.log("Processing GitLab callback for user:", userId)

    // Use GitLabOAuthService to handle the callback
    const result = await GitLabOAuthService.handleCallback(code, state, supabase, userId, baseUrl)

    if (result.success) {
      console.log("GitLab OAuth callback successful")
      return NextResponse.redirect(result.redirectUrl)
    } else {
      console.error("GitLab OAuth callback failed:", result.error)
      return NextResponse.redirect(result.redirectUrl)
    }
  } catch (error: any) {
    console.error("GitLab OAuth callback error:", error)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(error.message || "Callback processing failed")}`,
    )
  }
}
