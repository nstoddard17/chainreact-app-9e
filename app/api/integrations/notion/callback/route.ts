import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NotionOAuthService } from "@/lib/oauth/notion"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Notion OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Notion OAuth error:", error)
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_error&message=${encodeURIComponent(error)}&provider=notion`, request.url),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Notion callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=notion", request.url))
  }

  try {
    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("Notion: Session error:", sessionError)
      return NextResponse.redirect(
        new URL("/integrations?error=session_error&provider=notion&message=No+active+user+session+found", request.url),
      )
    }

    console.log("Notion: Session successfully retrieved for user:", sessionData.session.user.id)

    const baseUrl = new URL(request.url).origin
    const result = await NotionOAuthService.handleCallback(code, state, baseUrl, supabase, sessionData.session.user.id)

    console.log("Notion OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Notion OAuth callback error:", error)
    const errorMessage = encodeURIComponent(error.message || "Unknown error occurred")
    return NextResponse.redirect(
      new URL(`/integrations?error=callback_failed&provider=notion&message=${errorMessage}`, request.url),
    )
  }
}
