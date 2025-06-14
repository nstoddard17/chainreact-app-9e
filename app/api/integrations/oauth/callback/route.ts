import { type NextRequest, NextResponse } from "next/server"
import { handleCallback } from "@/lib/oauth/oauthUtils"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const provider = searchParams.get("provider")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

    // Handle OAuth errors
    if (error) {
      console.error(`OAuth error for ${provider}:`, error, errorDescription)
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(error)}&provider=${provider}`, baseUrl),
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL(`/integrations?error=missing_parameters&provider=${provider}`, baseUrl))
    }

    // Extract provider from state if not in query params
    let actualProvider = provider
    if (!actualProvider && state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString())
        actualProvider = stateData.provider
      } catch (e) {
        console.error("Failed to parse state:", e)
      }
    }

    if (!actualProvider) {
      return NextResponse.redirect(new URL(`/integrations?error=missing_provider`, baseUrl))
    }

    try {
      const result = await handleCallback(actualProvider, code, state)

      if (result.success) {
        return NextResponse.redirect(new URL(`/integrations?success=${actualProvider}&t=${Date.now()}`, baseUrl))
      } else {
        return NextResponse.redirect(
          new URL(`/integrations?error=${encodeURIComponent(result.error)}&provider=${actualProvider}`, baseUrl),
        )
      }
    } catch (error: any) {
      console.error(`OAuth callback error for ${actualProvider}:`, error)
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(error.message)}&provider=${actualProvider}`, baseUrl),
      )
    }
  } catch (error: any) {
    console.error("OAuth callback error:", error)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    return NextResponse.redirect(new URL(`/integrations?error=callback_failed`, baseUrl))
  }
}
