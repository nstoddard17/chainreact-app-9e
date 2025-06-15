import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { SimpleTwitterOAuth } from "@/lib/oauth/twitter-simple"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    console.log("🐦 Twitter callback received:", {
      hasCode: !!code,
      hasState: !!state,
      error,
      errorDescription,
    })

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

    // Handle OAuth errors from Twitter
    if (error) {
      console.error("🐦 Twitter OAuth error:", { error, errorDescription })
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(errorDescription || error)}&provider=twitter`, baseUrl),
      )
    }

    if (!code || !state) {
      console.error("🐦 Missing code or state")
      return NextResponse.redirect(new URL(`/integrations?error=missing_parameters&provider=twitter`, baseUrl))
    }

    // Create Supabase client
    const supabase = createServerComponentClient({ cookies })

    // Handle the callback
    const result = await SimpleTwitterOAuth.handleCallback(code, state, supabase)

    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("🐦 Twitter callback route error:", error)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(error.message)}&provider=twitter`, baseUrl),
    )
  }
}
