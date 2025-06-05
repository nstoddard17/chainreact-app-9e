import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { TeamsOAuthService } from "@/lib/oauth/teams"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  console.log("Teams OAuth callback:", {
    code: !!code,
    state: !!state,
    error,
    errorDescription,
  })

  if (error) {
    console.error("Teams OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=oauth_error&provider=teams&message=${encodeURIComponent(errorDescription || error)}`,
        baseUrl,
      ),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Teams callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=teams", baseUrl))
  }

  try {
    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })

    // Get session from cookies
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Teams: Error retrieving session:", sessionError)
      return NextResponse.redirect(
        new URL("/integrations?error=session_error&provider=teams&message=Error+retrieving+session", baseUrl),
      )
    }

    if (!sessionData?.session) {
      console.error("Teams: No session found in cookies")
      return NextResponse.redirect(
        new URL("/integrations?error=session_expired&provider=teams&message=Please+log+in+again", baseUrl),
      )
    }

    console.log("Teams: Session successfully retrieved for user:", sessionData.session.user.id)

    const result = await TeamsOAuthService.handleCallback(code, state, baseUrl, supabase, sessionData.session.user.id)

    // Clear the cache and redirect to success page
    try {
      await fetch(`${baseUrl}/api/integrations/clear-cache`, { method: "POST" })
      console.log("Cache cleared successfully")
    } catch (cacheError) {
      console.error("Failed to clear cache:", cacheError)
    }

    console.log("Teams OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("Teams OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
