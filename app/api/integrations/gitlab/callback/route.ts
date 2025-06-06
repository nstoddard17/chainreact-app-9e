import { type NextRequest, NextResponse } from "next/server"
import { GitLabOAuthService } from "@/lib/oauth/gitlab"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  if (error) {
    console.error("GitLab OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=${error}&provider=gitlab&message=${encodeURIComponent(
        errorDescription || "Authorization failed",
      )}`,
    )
  }

  if (!code || !state) {
    return NextResponse.redirect(`https://chainreact.app/integrations?error=missing_params&provider=gitlab`)
  }

  try {
    let stateData: any = {}
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      throw new Error("Invalid state parameter")
    }

    const { userId } = stateData

    if (!userId) {
      throw new Error("Missing user ID in state")
    }

    const result = await GitLabOAuthService.handleCallback(code, state, supabase, userId)
    return NextResponse.redirect(result.redirectUrl)
  } catch (error: any) {
    console.error("GitLab OAuth callback error:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(error.message)}`,
    )
  }
}
