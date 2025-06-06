import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { TwitterOAuthService } from "@/lib/oauth/twitter"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Twitter OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Twitter OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=twitter", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in Twitter callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=twitter", baseUrl))
  }

  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("Twitter: Session error:", sessionError)
      return NextResponse.redirect(
        new URL("/integrations?error=session_error&provider=twitter&message=No+active+user+session+found", baseUrl),
      )
    }

    console.log("Twitter: Session successfully retrieved for user:", sessionData.session.user.id)

    const result = await TwitterOAuthService.handleCallback(code, state, baseUrl, supabase, sessionData.session.user.id)

    console.log("Twitter OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("Twitter OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
