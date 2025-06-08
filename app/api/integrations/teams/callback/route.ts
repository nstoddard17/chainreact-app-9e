import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { TeamsOAuthService } from "@/lib/oauth/teams"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  console.log("Teams callback route - Request received")

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  if (error) {
    console.error("Teams callback route - OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=oauth_error&provider=teams&message=${encodeURIComponent(errorDescription || error)}`,
    )
  }

  if (!code || !state) {
    console.error("Teams callback route - Missing code or state")
    return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=missing_params&provider=teams`)
  }

  try {
    let stateData: any
    try {
      stateData = JSON.parse(atob(state))
    } catch (stateError) {
      console.error("Teams callback route - Failed to parse state:", stateError)
      return NextResponse.redirect(
        `${getBaseUrl(request)}/integrations?error=invalid_state&provider=teams&message=Could not parse state parameter`,
      )
    }

    const { userId } = stateData

    if (!userId) {
      console.error("Teams callback route - Missing user ID in state")
      return NextResponse.redirect(
        `${getBaseUrl(request)}/integrations?error=missing_user_id&provider=teams&message=User ID missing from state`,
      )
    }

    const result = await TeamsOAuthService.handleCallback(code, state, supabase, userId)

    if (result.success) {
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?success=teams_connected&provider=teams`)
    } else {
      return NextResponse.redirect(result.redirectUrl)
    }
  } catch (error: any) {
    console.error("Teams callback route - Unhandled error:", error)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
    )
  }
}
