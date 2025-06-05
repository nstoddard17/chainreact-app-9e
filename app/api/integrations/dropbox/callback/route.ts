import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { DropboxOAuthService } from "@/lib/oauth/dropbox"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Dropbox OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Dropbox OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=dropbox", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in Dropbox callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=dropbox", baseUrl))
  }

  try {
    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("Dropbox: Session error:", sessionError)
      return NextResponse.redirect(
        new URL("/integrations?error=session_error&provider=dropbox&message=No+active+user+session+found", baseUrl),
      )
    }

    console.log("Dropbox: Session successfully retrieved for user:", sessionData.session.user.id)

    const result = await DropboxOAuthService.handleCallback(code, state, baseUrl, supabase, sessionData.session.user.id)

    console.log("Dropbox OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("Dropbox OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=dropbox&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
