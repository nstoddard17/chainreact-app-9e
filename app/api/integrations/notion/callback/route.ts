import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NotionOAuthService } from "@/lib/oauth/notion"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Notion OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Notion OAuth error:", error)
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_error&message=${encodeURIComponent(error)}&provider=notion`, baseUrl),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Notion callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=notion", baseUrl))
  }

  try {
    // Parse state to get user ID
    let userId: string
    try {
      const stateData = JSON.parse(atob(state))
      userId = stateData.userId
      if (!userId) {
        throw new Error("No user ID in state")
      }
    } catch (stateError) {
      console.error("Notion: Invalid state parameter:", stateError)
      return NextResponse.redirect(
        new URL("/integrations?error=invalid_state&provider=notion&message=Invalid+state+parameter", baseUrl),
      )
    }

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })

    console.log("Notion: Processing OAuth for user:", userId)

    const result = await NotionOAuthService.handleCallback(code, state, supabase, userId)

    console.log("Notion OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("Notion OAuth callback error:", error)
    const errorMessage = encodeURIComponent(error.message || "Unknown error occurred")
    return NextResponse.redirect(
      new URL(`/integrations?error=callback_failed&provider=notion&message=${errorMessage}`, baseUrl),
    )
  }
}
