import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { GoogleOAuthService } from "@/lib/oauth/google"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const scope = searchParams.get("scope")

  console.log("Google OAuth callback:", { code: !!code, state, error, scope })

  if (error) {
    console.error("Google OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=google", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Google callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=google", request.url))
  }

  try {
    // Get session using route handler client
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Google: Error retrieving session:", sessionError)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=session_error&provider=google&message=${encodeURIComponent(sessionError.message)}`,
          request.url,
        ),
      )
    }

    if (!sessionData?.session?.access_token) {
      console.error("Google: No session or access token found")
      return NextResponse.redirect(
        new URL(
          "/integrations?error=session_error&provider=google&message=No+session+or+access+token+found",
          request.url,
        ),
      )
    }

    console.log("Google: Session successfully retrieved for user:", sessionData.session.user.id)

    const baseUrl = new URL(request.url).origin
    const result = await GoogleOAuthService.handleCallback(
      code,
      state,
      baseUrl,
      supabase,
      sessionData.session.access_token,
    )

    console.log("Google OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Google OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=google&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
