import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { AirtableOAuthService } from "@/lib/oauth/airtable"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  // Handle OAuth errors
  if (error) {
    console.error("Airtable OAuth error:", error)
    const baseUrl = new URL(request.url).origin
    return NextResponse.redirect(new URL(`/integrations?error=oauth_error&provider=airtable`, baseUrl))
  }

  // Validate required parameters
  if (!code || !state) {
    console.error("Missing code or state in Airtable callback")
    const baseUrl = new URL(request.url).origin
    return NextResponse.redirect(new URL(`/integrations?error=missing_params&provider=airtable`, baseUrl))
  }

  // Get base URL safely from request
  const baseUrl = new URL(request.url).origin

  try {
    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })

    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error("Airtable: Session error:", sessionError)
      return NextResponse.redirect(
        new URL(`/integrations?error=session_error&provider=airtable&message=No+active+user+session+found`, baseUrl),
      )
    }

    console.log("Airtable: Session successfully retrieved for user:", session.user.id)

    // Handle the OAuth callback using the secure service
    const result = await AirtableOAuthService.handleCallback(code, state, baseUrl, supabase, session.user.id)

    // Redirect based on result
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Unexpected error in Airtable callback:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=unexpected_error&provider=airtable&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
