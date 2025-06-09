import { type NextRequest, NextResponse } from "next/server"
import { handleCallback } from "@/lib/oauth/oauthUtils"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const provider = searchParams.get("provider")

    if (!code || !state || !provider) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    const tokenResponse = await handleCallback(provider, code, state)

    // Redirect to the integrations page with success message
    return NextResponse.redirect(new URL(`/integrations?success=${provider}`, request.url))
  } catch (error: any) {
    console.error("OAuth callback error:", error)

    // Redirect to the integrations page with error message
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(error.message)}`, request.url))
  }
}
