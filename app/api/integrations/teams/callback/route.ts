import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { TeamsOAuthService } from "@/lib/oauth/teams"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  if (error) {
    console.error("Teams OAuth error:", error)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=oauth_error&provider=teams&message=${encodeURIComponent(error)}`,
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Teams callback")
    return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=missing_params&provider=teams`)
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      throw new Error("Missing user ID in state")
    }

    const result = await TeamsOAuthService.handleCallback(code, state, supabase, userId)

    if (result.success) {
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?success=teams_connected&provider=teams`)
    } else {
      return NextResponse.redirect(result.redirectUrl)
    }
  } catch (error: any) {
    console.error("Teams OAuth callback error:", error)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
    )
  }
}
