import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { HubSpotOAuthService } from "@/lib/oauth/hubspot"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const baseUrl = "https://chainreact.app"

  if (!code || !state) {
    console.error("No code or state received")
    return NextResponse.redirect(`${baseUrl}/integrations?error=hubspot_no_code`)
  }

  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("HubSpot: Session error:", sessionError)
      return NextResponse.redirect(`${baseUrl}/integrations?error=session_error`)
    }

    const result = await HubSpotOAuthService.handleCallback(code, state, baseUrl, supabase, sessionData.session.user.id)

    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("HubSpot OAuth Error:", error)
    return NextResponse.redirect(`${baseUrl}/integrations?error=hubspot_oauth_error`)
  }
}
