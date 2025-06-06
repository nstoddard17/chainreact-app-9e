import { type NextRequest, NextResponse } from "next/server"
import { DiscordOAuthService } from "@/lib/oauth/discord"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  if (error) {
    return NextResponse.redirect(`https://chainreact.app/integrations?error=${error}&provider=discord`)
  }

  if (!code || !state) {
    return NextResponse.redirect(`https://chainreact.app/integrations?error=missing_params&provider=discord`)
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      throw new Error("Missing user ID in state")
    }

    const result = await DiscordOAuthService.handleCallback(code, state, supabase, userId)
    return NextResponse.redirect(result.redirectUrl)
  } catch (error: any) {
    console.error("Discord OAuth callback error:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=callback_failed&provider=discord&message=${encodeURIComponent(error.message)}`,
    )
  }
}
