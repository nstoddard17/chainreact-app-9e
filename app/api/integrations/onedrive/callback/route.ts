import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { OneDriveOAuthService } from "@/lib/oauth/onedrive"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  const baseUrl = "https://chainreact.app"

  if (error) {
    console.error("OneDrive Auth Error:", error, error_description)
    return NextResponse.redirect(`${baseUrl}/integrations?error=onedrive_auth_failed`)
  }

  if (!code || !state) {
    console.error("Missing code or state")
    return NextResponse.redirect(`${baseUrl}/integrations?error=missing_code_or_state`)
  }

  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("OneDrive: Session error:", sessionError)
      return NextResponse.redirect(`${baseUrl}/integrations?error=session_error`)
    }

    const result = await OneDriveOAuthService.handleCallback(code, state, supabase, sessionData.session.user.id)

    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (e: any) {
    console.error("Error during OneDrive auth:", e)
    return NextResponse.redirect(`${baseUrl}/integrations?error=onedrive_auth_failed`)
  }
}
