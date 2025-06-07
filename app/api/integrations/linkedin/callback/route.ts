import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { LinkedInOAuthService } from "@/lib/oauth/linkedin"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code || !state) {
      const baseUrl = getBaseUrl(request)
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_code_or_state`)
    }

    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("LinkedIn: Session error:", sessionError)
      const baseUrl = getBaseUrl(request)
      return NextResponse.redirect(`${baseUrl}/integrations?error=session_error`)
    }

    const result = await LinkedInOAuthService.handleCallback(
      code,
      state,
      getBaseUrl(request),
      supabase,
      sessionData.session.user.id,
    )

    return NextResponse.redirect(new URL(result.redirectUrl, getBaseUrl(request)))
  } catch (error) {
    console.error("LinkedIn Callback Error:", error)
    const baseUrl = getBaseUrl(request)
    return NextResponse.redirect(`${baseUrl}/integrations?error=callback_error`)
  }
}
