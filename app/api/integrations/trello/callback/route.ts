import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { TrelloOAuthService } from "@/lib/oauth/trello"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const token = searchParams.get("token")
  const state = searchParams.get("state")

  console.log("Trello OAuth callback (GET):", {
    token: !!token,
    state: !!state,
    allParams: Object.fromEntries(searchParams.entries()),
    url: request.url,
  })

  // For Trello's special flow, redirect to our auth page
  if (!token && state) {
    return NextResponse.redirect(new URL(`/integrations/trello-auth?state=${state}`, baseUrl))
  }

  if (!token) {
    console.log("No token in query params, redirecting to client-side handler")
    return NextResponse.redirect(new URL("/integrations?trello_auth=pending", baseUrl))
  }

  if (!state) {
    console.error("Missing state in Trello callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_state&provider=trello", baseUrl))
  }

  return handleTrelloCallback(token, state, baseUrl)
}

export async function POST(request: NextRequest) {
  const baseUrl = new URL(request.url).origin

  try {
    const body = await request.json()
    const { token, state } = body

    console.log("Trello OAuth callback (POST):", {
      token: !!token,
      state: !!state,
    })

    if (!token || !state) {
      return NextResponse.json({ success: false, error: "Missing token or state" }, { status: 400 })
    }

    const result = await handleTrelloCallback(token, state, baseUrl)

    // For POST requests, return JSON instead of redirecting
    if (result.headers.get("location")) {
      const redirectUrl = result.headers.get("location")
      const success = redirectUrl?.includes("success=trello_connected")

      return NextResponse.json({
        success,
        redirectUrl,
        error: success ? null : "Authorization failed",
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Trello OAuth POST callback error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

async function handleTrelloCallback(token: string, state: string, baseUrl: string) {
  try {
    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError || !sessionData?.session) {
      console.error("Trello: Session error:", sessionError)
      return NextResponse.redirect(
        new URL("/integrations?error=session_error&provider=trello&message=No+active+user+session+found", baseUrl),
      )
    }

    console.log("Trello: Session successfully retrieved for user:", sessionData.session.user.id)

    const result = await TrelloOAuthService.handleCallback(token, state, baseUrl, supabase, sessionData.session.user.id)

    console.log("Trello OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("Trello OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=trello&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
