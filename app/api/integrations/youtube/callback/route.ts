import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { YouTubeOAuthService } from "@/lib/oauth/youtube"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("YouTube OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("YouTube OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=youtube", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in YouTube callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=youtube", baseUrl))
  }

  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("YouTube: Session error:", sessionError)
      return NextResponse.redirect(
        new URL("/integrations?error=session_error&provider=youtube&message=No+active+user+session+found", baseUrl),
      )
    }

    console.log("YouTube: Session successfully retrieved for user:", sessionData.session.user.id)

    const result = await YouTubeOAuthService.handleCallback(code, state, baseUrl)

    console.log("YouTube OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("YouTube OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=youtube&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
